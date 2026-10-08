import { categories, lineTags, transactionLines, transactions } from "@num/db";
import { storyLineKind, type StoryLine } from "@num/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";

export type LedgerLine = {
  lineId: string;
  date: string;
  month: string;
  amount: number;
  categoryId: string | null;
  groupId: string | null;
  merchantId: string | null;
  kind: StoryLine["kind"];
  transfer: boolean;
  tagIds: string[];
};

export function loadLedgerLines(db: Db, range?: { from: string; through: string }): LedgerLine[] {
  const rows = db
    .select({
      lineId: transactionLines.id,
      date: transactions.date,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      groupId: categories.groupId,
      merchantId: transactions.merchantId,
      kind: categories.kind,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        range ? gte(transactions.date, range.from) : undefined,
        range ? lte(transactions.date, range.through) : undefined,
      ),
    )
    .all();
  const tags = db.select({ lineId: lineTags.lineId, tagId: lineTags.tagId }).from(lineTags).all();
  const byLine = new Map<string, string[]>();
  for (const tag of tags) {
    const list = byLine.get(tag.lineId) ?? [];
    list.push(tag.tagId);
    byLine.set(tag.lineId, list);
  }
  return rows.map((row) => ({
    lineId: row.lineId,
    date: row.date,
    month: row.date.slice(0, 7),
    amount: row.amount,
    categoryId: row.categoryId,
    groupId: row.groupId,
    merchantId: row.merchantId,
    kind: storyLineKind(row.kind),
    transfer: row.transferAccountId !== null,
    tagIds: byLine.get(row.lineId) ?? [],
  }));
}
