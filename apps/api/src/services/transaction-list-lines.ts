import { sql } from "drizzle-orm";
import type { TransactionListItem } from "@num/shared";
import type { Db } from "../db";

/** The category or transfer target of each line, for the Category column. */
export function linesForIds(db: Db, ids: readonly string[]): Map<string, TransactionListItem["lines"]> {
  const byId = new Map<string, TransactionListItem["lines"]>();
  if (ids.length === 0) {
    return byId;
  }
  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const rows = db.all<{ transactionId: string; categoryId: string | null; transferAccountId: string | null }>(sql`
    select transaction_id as transactionId, category_id as categoryId, transfer_account_id as transferAccountId
    from transaction_lines
    where transaction_id in (${list})
    order by id asc
  `);
  for (const row of rows) {
    const lines = byId.get(row.transactionId) ?? [];
    lines.push({ categoryId: row.categoryId, transferAccountId: row.transferAccountId });
    byId.set(row.transactionId, lines);
  }
  return byId;
}
