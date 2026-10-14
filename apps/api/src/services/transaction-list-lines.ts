import { transactionLines } from "@num/db";
import type { TransactionListItem } from "@num/shared";
import { asc, inArray } from "drizzle-orm";
import type { Db } from "../db";

/** The category or transfer target of each line, for the Category column. */
export function linesForIds(db: Db, ids: readonly string[]): Map<string, TransactionListItem["lines"]> {
  const byId = new Map<string, TransactionListItem["lines"]>();
  if (ids.length === 0) {
    return byId;
  }
  const rows = db
    .select({
      transactionId: transactionLines.transactionId,
      categoryId: transactionLines.categoryId,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactionLines)
    .where(inArray(transactionLines.transactionId, [...ids]))
    .orderBy(asc(transactionLines.id))
    .all();
  for (const { transactionId, ...line } of rows) {
    const lines = byId.get(transactionId) ?? [];
    lines.push(line);
    byId.set(transactionId, lines);
  }
  return byId;
}
