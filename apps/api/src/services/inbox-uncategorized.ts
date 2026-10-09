import { alternateFromMatch, suggestionFromMatch, uncategorizedLineKey, type InboxItem, type Suggestion } from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { loadMatchBook, scorePayee } from "./match-book";

type Row = {
  transactionId: string;
  lineId: string;
  accountId: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payee: string;
};

export function uncategorizedInbox(db: Db, hidden: ReadonlySet<string>): InboxItem[] {
  const rows = db.all<Row>(sql`
    select
      t.id as transactionId,
      min(l.id) as lineId,
      t.account_id as accountId,
      t.date as date,
      t.amount as amount,
      t.payee_raw as payeeRaw,
      t.payee_normalized as payee
    from transaction_lines l
    inner join transactions t on t.id = l.transaction_id
    where l.category_id is null
      and l.transfer_account_id is null
     
    group by t.id
  `);
  if (rows.length === 0) {
    return [];
  }
  const book = loadMatchBook(db);
  const cache = new Map<string, { suggestion: Suggestion; next: Suggestion | null }>();
  const items = rows.map((row) => {
    const cacheKey = `${row.payee}\u0000${row.amount}`;
    let cached = cache.get(cacheKey);
    if (!cached) {
      const scored = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
      cached = { suggestion: suggestionFromMatch(scored), next: alternateFromMatch(scored) };
      cache.set(cacheKey, cached);
    }
    return {
      kind: "uncategorized" as const,
      itemKey: uncategorizedLineKey(row.lineId),
      date: row.date,
      accountId: row.accountId,
      transactionId: row.transactionId,
      lineId: row.lineId,
      amount: row.amount,
      payee: row.payee,
      payeeRaw: row.payeeRaw,
      suggestion: cached.suggestion,
      next: cached.next,
    };
  });
  return items.filter((item) => !hidden.has(item.itemKey));
}
