import { accounts } from "@num/db";
import { accountKinds, autoReasons, transactionStatuses, type AccountKind, type AutoReason, type TransactionFilter, type TransactionListItem, type TransactionListQuery, type TransactionReview, type TransactionStatus } from "@num/shared";
import { eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listNeedsReview, reviewCounts, type NeedsReviewHit } from "./needs-review";
const sortColumns = {
  date: "t.date",
  amount: "t.amount",
  payeeRaw: "t.payee_raw",
} as const;

type ListRow = {
  id: string;
  accountId: string;
  accountName: string;
  accountKind: string;
  date: string;
  amount: number;
  payeeRaw: string;
  merchantId: string | null;
  merchantName: string | null;
  status: string;
  reconciled: number;
  accountOpening: number;
  runningBalance: number | null;
  autoReason: string | null;
  autoConfidence: number | null;
  autoSourceName: string | null;
  autoLearnedCount: number | null;
  refundOfDate: string | null;
  refundOfAmount: number | null;
  refundOfPayee: string | null;
  refundOfKey: string | null;
  refundedAmount: number | null;
};

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asAutoReason(value: string | null): AutoReason | null {
  if (value && (autoReasons as readonly string[]).includes(value)) {
    return value as AutoReason;
  }
  return null;
}

function asStatus(value: string): TransactionStatus {
  if (!(transactionStatuses as readonly string[]).includes(value)) {
    throw new Error("Unknown transaction status");
  }
  return value as TransactionStatus;
}

function orderSql(query: TransactionListQuery): SQL {
  if (query.automatic && query.sort === undefined) {
    return sql`t.auto_confidence asc, t.id asc`;
  }
  const column = sortColumns[query.sort ?? "date"];
  const direction = query.dir ?? (query.sort === undefined ? "desc" : "asc");
  return sql.raw(`${column} ${direction}, t.id ${direction}`);
}

function filters(query: TransactionFilter): SQL {
  const parts: SQL[] = [];
  if (query.accountId) {
    parts.push(sql`t.account_id = ${query.accountId}`);
  }
  if (query.merchantId === "none") {
    parts.push(sql`t.merchant_id is null`);
  } else if (query.merchantId) {
    parts.push(sql`t.merchant_id = ${query.merchantId}`);
  }
  if (query.groupId === "none") {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      join categories c on c.id = l.category_id
      where l.transaction_id = t.id and c.group_id is null
    )`);
  } else if (query.groupId) {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      join categories c on c.id = l.category_id
      where l.transaction_id = t.id and c.group_id = ${query.groupId}
    )`);
  }
  if (query.from) {
    parts.push(sql`t.date >= ${query.from}`);
  }
  if (query.to) {
    parts.push(sql`t.date <= ${query.to}`);
  }
  if (query.categoryId) {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      where l.transaction_id = t.id and l.category_id = ${query.categoryId}
    )`);
  }
  if (query.tagId === "none") {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      join categories c on c.id = l.category_id
      where l.transaction_id = t.id
        and c.kind = 'expense'
        and not exists (select 1 from line_tags lt where lt.line_id = l.id)
    )`);
  } else if (query.tagId) {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      join line_tags lt on lt.line_id = l.id
      where l.transaction_id = t.id and lt.tag_id = ${query.tagId}
    )`);
  }
  if (query.uncategorized) {
    parts.push(sql`exists (
      select 1 from transaction_lines l
      where l.transaction_id = t.id
        and l.category_id is null
        and l.transfer_account_id is null
    )`);
  }
  if (query.automatic) {
    parts.push(sql`t.auto_reason is not null`);
  }
  if (query.q) {
    const needle = query.q;
    parts.push(sql`(
      instr(lower(t.payee_raw), lower(${needle})) > 0
      or instr(lower(ifnull(t.notes, '')), lower(${needle})) > 0
      or instr(lower(ifnull(m.name, '')), lower(${needle})) > 0
    )`);
  }
  if (parts.length === 0) {
    return sql`1 = 1`;
  }
  return sql.join(parts, sql` and `);
}

function toItem(row: ListRow, review: TransactionReview | null): TransactionListItem {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: asKind(row.accountKind),
    date: row.date,
    amount: row.amount,
    payeeRaw: row.payeeRaw,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    status: asStatus(row.status),
    reconciled: row.reconciled === 1,
    runningBalance: row.runningBalance,
    autoReason: asAutoReason(row.autoReason),
    autoConfidence: row.autoConfidence,
    autoSourceName: row.autoSourceName,
    autoLearnedCount: row.autoLearnedCount === null ? null : Number(row.autoLearnedCount),
    refundOf:
      row.refundOfKey === null || row.refundOfDate === null || row.refundOfAmount === null || row.refundOfPayee === null
        ? null
        : { id: row.refundOfKey, date: row.refundOfDate, amount: row.refundOfAmount, payeeRaw: row.refundOfPayee },
    refundedAmount: row.refundedAmount,
    review:
      review === null
        ? null
        : {
            ...review,
            learnedCount: review.learnedCount ?? (row.autoLearnedCount === null ? null : Number(row.autoLearnedCount)),
          },
  };
}

function usesTransactionBalance(db: Db, accountId: string): boolean {
  const row = db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).get();
  return row !== undefined && row.kind !== "investment" && row.kind !== "property";
}

function fillRunningBalances(db: Db, accountId: string, rows: ListRow[]): void {
  if (rows.length === 0) {
    return;
  }
  const ids = sql.join(
    rows.map((row) => sql`${row.id}`),
    sql`, `,
  );
  const balances = db.all<{ id: string; spent: number }>(sql`
    select id, spent from (
      select tx.id as id,
        sum(tx.amount) over (order by tx.date asc, tx.id asc) as spent
      from transactions tx
      where tx.account_id = ${accountId}
    )
    where id in (${ids})
  `);
  const spentById = new Map(balances.map((row) => [row.id, row.spent]));
  for (const row of rows) {
    const spent = spentById.get(row.id);
    if (spent === undefined) {
      throw new Error("Running balance is missing");
    }
    const balance = row.accountOpening + spent;
    if (!Number.isSafeInteger(balance)) {
      throw new Error("Sum is not an integer");
    }
    row.runningBalance = balance;
  }
}

function pageHits(hits: readonly NeedsReviewHit[], query: TransactionListQuery): NeedsReviewHit[] {
  const offset = (query.page - 1) * query.pageSize;
  return hits.slice(offset, offset + query.pageSize);
}

function rowsForIds(db: Db, ids: readonly string[]): ListRow[] {
  if (ids.length === 0) {
    return [];
  }
  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  return db.all<ListRow>(sql`
    select
      t.id as id,
      t.account_id as accountId,
      a.name as accountName,
      a.kind as accountKind,
      t.date as date,
      t.amount as amount,
      t.payee_raw as payeeRaw,
      t.merchant_id as merchantId,
      m.name as merchantName,
      t.status as status,
      case when t.date <= (
        select max(c.date) from checkpoints c
        where c.account_id = t.account_id and c.unlocked_at is null
      ) then 1 else 0 end as reconciled,
      a.opening_balance as accountOpening,
      null as runningBalance,
      t.auto_reason as autoReason,
      t.auto_confidence as autoConfidence,
      case
        when t.auto_reason = 'recurring' then (select p.name from recurring_plans p where p.id = t.auto_source_id)
        when t.auto_reason = 'merchant_default' then (select m2.name from merchants m2 where m2.id = t.auto_source_id)
        else (select s.payee_normalized from transactions s where s.id = t.auto_source_id)
      end as autoSourceName,
      case when t.auto_reason is null then null else (
        select count(*) from transactions c
        inner join transaction_lines cl on cl.transaction_id = c.id
        where c.auto_reason is null and c.payee_normalized = t.payee_normalized
          and cl.category_id is not null and cl.transfer_account_id is null
      ) end as autoLearnedCount,
      (select p.id from transactions p where p.id = t.refund_of_id) as refundOfKey,
      (select p.date from transactions p where p.id = t.refund_of_id) as refundOfDate,
      (select p.amount from transactions p where p.id = t.refund_of_id) as refundOfAmount,
      (select p.payee_raw from transactions p where p.id = t.refund_of_id) as refundOfPayee,
      (select sum(r.amount) from transactions r where r.refund_of_id = t.id) as refundedAmount
    from transactions t
    join accounts a on a.id = t.account_id
    left join merchants m on m.id = t.merchant_id
    where t.id in (${list})
  `);
}

function hasFilter(filter: TransactionFilter): boolean {
  return Object.values(filter).some((value) => value !== undefined && value !== false);
}

/** Needs review rows that also match the other filters. Bulk approval uses the same set. */
export function filteredReviewHits(db: Db, filter: TransactionFilter, asOf: string): NeedsReviewHit[] {
  const hits = listNeedsReview(db, asOf);
  if (!hasFilter(filter)) {
    return hits;
  }
  const matching = new Set(
    db
      .all<{ id: string }>(sql`
        select t.id as id
        from transactions t
        ${filter.q ? sql`left join merchants m on m.id = t.merchant_id` : sql``}
        where ${filters(filter)}
      `)
      .map((row) => row.id),
  );
  return hits.filter((hit) => matching.has(hit.id));
}

export function listTransactions(db: Db, query: TransactionListQuery & { asOf?: string }) {
  if (query.needsReview) {
    if (!query.asOf) {
      throw new ServiceError("as_of_invalid", 400, { asOf: "" });
    }
    const hits = filteredReviewHits(db, query, query.asOf);
    const page = pageHits(hits, query);
    const byId = new Map(rowsForIds(db, page.map((hit) => hit.id)).map((row) => [row.id, row]));
    return {
      items: page.flatMap((hit) => {
        const row = byId.get(hit.id);
        return row ? [toItem(row, hit.review)] : [];
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: hits.length,
      reviewCounts: reviewCounts(hits),
    };
  }
  const where = filters(query);
  const merchantJoin = sql`left join merchants m on m.id = t.merchant_id`;
  const totalRows = db.all<{ total: number }>(sql`
    select count(*) as total
    from transactions t
    ${query.q ? merchantJoin : sql``}
    where ${where}
  `);
  const total = totalRows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const rows = db.all<ListRow>(sql`
    select
      t.id as id,
      t.account_id as accountId,
      a.name as accountName,
      a.kind as accountKind,
      t.date as date,
      t.amount as amount,
      t.payee_raw as payeeRaw,
      t.merchant_id as merchantId,
      m.name as merchantName,
      t.status as status,
      case when t.date <= (
        select max(c.date) from checkpoints c
        where c.account_id = t.account_id and c.unlocked_at is null
      ) then 1 else 0 end as reconciled,
      a.opening_balance as accountOpening,
      null as runningBalance,
      t.auto_reason as autoReason,
      t.auto_confidence as autoConfidence,
      case
        when t.auto_reason = 'recurring' then (select p.name from recurring_plans p where p.id = t.auto_source_id)
        when t.auto_reason = 'merchant_default' then (select m2.name from merchants m2 where m2.id = t.auto_source_id)
        else (select s.payee_normalized from transactions s where s.id = t.auto_source_id)
      end as autoSourceName,
      case when t.auto_reason is null then null else (
        select count(*) from transactions c
        inner join transaction_lines cl on cl.transaction_id = c.id
        where c.auto_reason is null and c.payee_normalized = t.payee_normalized
          and cl.category_id is not null and cl.transfer_account_id is null
      ) end as autoLearnedCount,
      (select p.id from transactions p where p.id = t.refund_of_id) as refundOfKey,
      (select p.date from transactions p where p.id = t.refund_of_id) as refundOfDate,
      (select p.amount from transactions p where p.id = t.refund_of_id) as refundOfAmount,
      (select p.payee_raw from transactions p where p.id = t.refund_of_id) as refundOfPayee,
      (select sum(r.amount) from transactions r where r.refund_of_id = t.id) as refundedAmount
    from transactions t
    join accounts a on a.id = t.account_id
    ${merchantJoin}
    where ${where}
    order by ${orderSql(query)}
    limit ${query.pageSize} offset ${offset}
  `);
  if (query.accountId && usesTransactionBalance(db, query.accountId)) {
    fillRunningBalances(db, query.accountId, rows);
  }
  return {
    items: rows.map((row) => toItem(row, null)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    reviewCounts: null,
  };
}
