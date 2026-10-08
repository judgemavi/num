import { merchants, rules } from "@num/db";
import { suggestCategorization, type HistoryRow, type InboxItem, type Suggestion } from "@num/shared";
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

export function uncategorizedItems(db: Db): InboxItem[] {
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
      l.amount as amount,
      t.payee_raw as payeeRaw,
      t.payee_normalized as payee
    from transaction_lines l
    inner join transactions t on t.id = l.transaction_id
    where l.category_id is null
      and l.transfer_account_id is null
      and t.deleted_at is null
  `);
  if (rows.length === 0) {
    return [];
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
  return rows.map((row) => {
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
      kind: "uncategorized" as const,
      itemKey: `uncategorized:${row.lineId}`,
      date: row.date,
      transactionId: row.transactionId,
      lineId: row.lineId,
      accountId: row.accountId,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      suggestion,
    };
  });
}
