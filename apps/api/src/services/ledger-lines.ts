import { categories, transactionLines, transactions } from "@num/db";
import { flowLineKind, type FlowLine } from "@num/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db";

export type LedgerLine = {
  lineId: string;
  date: string;
  month: string;
  amount: number;
  categoryId: string | null;
  groupId: string | null;
  merchantId: string | null;
  kind: FlowLine["kind"];
  transfer: boolean;
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
        range ? gte(transactions.date, range.from) : undefined,
        range ? lte(transactions.date, range.through) : undefined,
      ),
    )
    .all();
  return rows.map((row) => ({
    lineId: row.lineId,
    date: row.date,
    month: row.date.slice(0, 7),
    amount: row.amount,
    categoryId: row.categoryId,
    groupId: row.groupId,
    merchantId: row.merchantId,
    kind: flowLineKind(row.kind),
    transfer: row.transferAccountId !== null,
  }));
}
