import { accounts } from "@num/db";
import { accountKinds, transactionStatuses, type AccountKind, type TransactionListItem, type TransactionListQuery, type TransactionStatus } from "@num/shared";
import { eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";

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
  accountOpening: number;
  runningBalance: number | null;
};

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asStatus(value: string): TransactionStatus {
  if (!(transactionStatuses as readonly string[]).includes(value)) {
    throw new Error("Unknown transaction status");
  }
  return value as TransactionStatus;
}

function orderSql(query: TransactionListQuery): SQL {
  const column = sortColumns[query.sort ?? "date"];
  const direction = query.dir ?? (query.sort === undefined ? "desc" : "asc");
  return sql.raw(`${column} ${direction}, t.id ${direction}`);
}

function filters(query: TransactionListQuery): SQL {
  const parts: SQL[] = [sql`t.deleted_at is null`];
  if (query.accountId) {
    parts.push(sql`t.account_id = ${query.accountId}`);
  }
  if (query.merchantId) {
    parts.push(sql`t.merchant_id = ${query.merchantId}`);
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
  if (query.tagId) {
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
  if (query.q) {
    const needle = query.q;
    parts.push(sql`(
      instr(lower(t.payee_raw), lower(${needle})) > 0
      or instr(lower(ifnull(t.notes, '')), lower(${needle})) > 0
      or instr(lower(ifnull(m.name, '')), lower(${needle})) > 0
    )`);
  }
  return sql.join(parts, sql` and `);
}

function toItem(row: ListRow): TransactionListItem {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    accountKind: asKind(row.accountKind),
    date: row.date,
    amount: integerSum(row.amount),
    payeeRaw: row.payeeRaw,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    status: asStatus(row.status),
    runningBalance: row.runningBalance === null ? null : integerSum(row.runningBalance),
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
  const balances = db.all<{ id: string; spent: unknown }>(sql`
    select id, spent from (
      select tx.id as id,
        sum(tx.amount) over (order by tx.date asc, tx.id asc) as spent
      from transactions tx
      where tx.deleted_at is null and tx.account_id = ${accountId}
    )
    where id in (${ids})
  `);
  const spentById = new Map(balances.map((row) => [row.id, integerSum(row.spent)]));
  for (const row of rows) {
    const spent = spentById.get(row.id);
    if (spent === undefined) {
      throw new Error("Running balance is missing");
    }
    const balance = integerSum(row.accountOpening) + spent;
    if (!Number.isSafeInteger(balance)) {
      throw new Error("Sum is not an integer");
    }
    row.runningBalance = balance;
  }
}

export function listTransactions(db: Db, query: TransactionListQuery) {
  const where = filters(query);
  const merchantJoin = sql`left join merchants m on m.id = t.merchant_id`;
  const totalRows = db.all<{ total: unknown }>(sql`
    select count(*) as total
    from transactions t
    ${query.q ? merchantJoin : sql``}
    where ${where}
  `);
  const total = integerSum(totalRows[0]?.total ?? 0);
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
      a.opening_balance as accountOpening,
      null as runningBalance
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
    items: rows.map(toItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
