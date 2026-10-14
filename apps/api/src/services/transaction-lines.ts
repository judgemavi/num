import { lineTags, transactionLines } from "@num/db";
import { eq, inArray, sql } from "drizzle-orm";
import type { NormalizedLine } from "./transaction-rules";
import type { WriteTx, Reader } from "./write";

export type StoredLine = NormalizedLine & { id: string };

export function loadLines(db: Reader, transactionId: string): StoredLine[] {
  const rows = db
    .select()
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, transactionId))
    .orderBy(sql`rowid`)
    .all();
  if (rows.length === 0) {
    return [];
  }
  const tags = db
    .select()
    .from(lineTags)
    .where(
      inArray(
        lineTags.lineId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(sql`rowid`)
    .all();
  const byLine = new Map<string, string[]>();
  for (const tag of tags) {
    const list = byLine.get(tag.lineId) ?? [];
    list.push(tag.tagId);
    byLine.set(tag.lineId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    memo: row.memo,
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    tagIds: byLine.get(row.id) ?? [],
  }));
}

export function replaceLines(tx: WriteTx, transactionId: string, lines: NormalizedLine[]): void {
  const existing = tx
    .select({ id: transactionLines.id })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, transactionId))
    .all();
  if (existing.length > 0) {
    tx.delete(lineTags)
      .where(
        inArray(
          lineTags.lineId,
          existing.map((row) => row.id),
        ),
      )
      .run();
    tx.delete(transactionLines).where(eq(transactionLines.transactionId, transactionId)).run();
  }
  for (const line of lines) {
    const id = crypto.randomUUID();
    tx.insert(transactionLines)
      .values({
        id,
        transactionId,
        amount: line.amount,
        memo: line.memo,
        categoryId: line.categoryId,
        transferAccountId: line.transferAccountId,
      })
      .run();
    for (const tagId of line.tagIds) {
      tx.insert(lineTags).values({ lineId: id, tagId }).run();
    }
  }
}
