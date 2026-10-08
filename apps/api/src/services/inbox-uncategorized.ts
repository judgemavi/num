import { merchants, rules } from "@num/db";
import {
  alternateSuggestion,
  groupByPayee,
  suggestCategorization,
  uncategorizedItemKey,
  uncategorizedLineKey,
  type HistoryRow,
  type InboxItem,
  type PayeeGroup,
  type PayeeGroupRow,
  type Suggestion,
} from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { toRule } from "./rules";

type Head = {
  id: string;
  date: string;
  payeeRaw: string;
  merchantId: string | null;
  payee: string;
};

function chunks<T>(values: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function exactHistory(db: Db, payee: string): HistoryRow[] {
  return db.all<HistoryRow>(sql`
    select
      t.id as id,
      t.date as date,
      t.payee_raw as payeeRaw,
      t.merchant_id as merchantId,
      min(l.category_id) as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.deleted_at is null
      and t.payee_normalized = ${payee}
      and l.category_id is not null
    group by t.id
    having count(distinct l.category_id) = 1
    order by t.date desc, t.id desc
    limit 10
  `);
}

function clientOf(db: Db): { prepare(query: string): { all(value: string): Omit<Head, "payee">[] } } {
  return (db as unknown as { $client: { prepare(query: string): { all(value: string): Omit<Head, "payee">[] } } }).$client;
}

function historyFor(db: Db, payees: readonly string[]): Map<string, HistoryRow[]> {
  const heads: Head[] = [];
  const scanned = new Map<string, number>();
  const recent = clientOf(db).prepare(`
    select id, date, payee_raw as payeeRaw, merchant_id as merchantId
    from transactions
    where deleted_at is null and payee_normalized = ?
    order by date desc, id desc
    limit 40
  `);
  for (const payee of payees) {
    const rows = recent.all(payee);
    scanned.set(payee, rows.length);
    for (const row of rows) {
      heads.push({ ...row, payee });
    }
  }
  const lines = new Map<string, (string | null)[]>();
  for (const group of chunks(heads.map((head) => head.id), 400)) {
    if (group.length === 0) {
      continue;
    }
    const list = sql.join(
      group.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = db.all<{ transactionId: string; categoryId: string | null }>(sql`
      select transaction_id as transactionId, category_id as categoryId
      from transaction_lines
      where transaction_id in (${list})
    `);
    for (const row of rows) {
      const current = lines.get(row.transactionId) ?? [];
      current.push(row.categoryId);
      lines.set(row.transactionId, current);
    }
  }
  const grouped = new Map<string, HistoryRow[]>();
  for (const head of heads) {
    const current = grouped.get(head.payee) ?? [];
    if (current.length >= 10) {
      continue;
    }
    const categories = new Set((lines.get(head.id) ?? []).filter((id): id is string => id !== null));
    if (categories.size !== 1) {
      continue;
    }
    const categoryId = [...categories][0];
    if (!categoryId) {
      continue;
    }
    current.push({
      id: head.id,
      date: head.date,
      payeeRaw: head.payeeRaw,
      merchantId: head.merchantId,
      categoryId,
    });
    grouped.set(head.payee, current);
  }
  for (const payee of payees) {
    if ((scanned.get(payee) ?? 0) >= 40 && (grouped.get(payee)?.length ?? 0) < 10) {
      grouped.set(payee, exactHistory(db, payee));
    }
  }
  return grouped;
}

function toItems(
  groups: PayeeGroup[],
  rows: PayeeGroupRow[],
  context: { rules: ReturnType<typeof toRule>[]; history: Map<string, HistoryRow[]>; merchants: Parameters<typeof alternateSuggestion>[0]["merchants"] },
): InboxItem[] {
  return groups.map((group) => {
    const sample = rows.find((row) => row.accountId === group.accountId && row.payee === group.payee);
    const next = sample
      ? alternateSuggestion({
          accountId: group.accountId,
          rawPayee: sample.payeeRaw,
          rules: context.rules,
          history: context.history.get(group.payee) ?? [],
          merchants: context.merchants,
        })
      : null;
    return {
      kind: "uncategorized" as const,
      itemKey: uncategorizedItemKey(group.accountId, group.payee),
      date: group.date,
      accountId: group.accountId,
      payee: group.payee,
      payeeRaw: group.payeeRaw,
      count: group.count,
      total: group.total,
      transactionIds: group.transactionIds,
      lineIds: group.lineIds,
      suggestion: group.suggestion,
      next,
    };
  });
}

export function uncategorizedInbox(db: Db, hidden: ReadonlySet<string>): { open: InboxItem[]; closed: InboxItem[] } {
  const rows = db.all<{
    transactionId: string;
    lineId: string;
    accountId: string;
    date: string;
    amount: number;
    payeeRaw: string;
    payee: string;
  }>(sql`
    select
      t.id as transactionId,
      l.id as lineId,
      t.account_id as accountId,
      t.date as date,
      t.amount as amount,
      t.payee_raw as payeeRaw,
      t.payee_normalized as payee
    from transaction_lines l
    inner join transactions t on t.id = l.transaction_id
    where l.category_id is null
      and l.transfer_account_id is null
      and t.deleted_at is null
  `);
  if (rows.length === 0) {
    return { open: [], closed: [] };
  }
  const payees = [...new Set(rows.map((row) => row.payee).filter((payee) => payee.length > 0))];
  const history = historyFor(db, payees);
  const ruleRows = db.select().from(rules).all().map((row) => toRule(row));
  const merchantRows = db
    .select({
      id: merchants.id,
      name: merchants.name,
      defaultCategoryId: merchants.defaultCategoryId,
      archivedAt: merchants.archivedAt,
    })
    .from(merchants)
    .all();
  const cache = new Map<string, Suggestion>();
  const grouped: PayeeGroupRow[] = rows.map((row) => {
    const cacheKey = `${row.accountId}\u0000${row.payee}`;
    let suggestion = cache.get(cacheKey);
    if (!suggestion) {
      suggestion = suggestCategorization({
        accountId: row.accountId,
        rawPayee: row.payeeRaw,
        rules: ruleRows,
        history: history.get(row.payee) ?? [],
        merchants: merchantRows,
      });
      cache.set(cacheKey, suggestion);
    }
    return {
      transactionId: row.transactionId,
      lineId: row.lineId,
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      payee: row.payee,
      suggestion,
    };
  });
  const context = { rules: ruleRows, history, merchants: merchantRows };
  const openRows = grouped.filter((row) => !hidden.has(uncategorizedLineKey(row.lineId)));
  const closedRows = grouped.filter((row) => hidden.has(uncategorizedLineKey(row.lineId)));
  return {
    open: toItems(groupByPayee(openRows), openRows, context),
    closed: toItems(groupByPayee(closedRows), closedRows, context),
  };
}
