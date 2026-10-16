import { accounts, categories, lineTags, transactionLines, transactions } from "@num/db";
import { flowLineKind, type FlowLine } from "@num/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
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
  debtAccountId: string | null;
};

type LineFilter = { from?: string; through?: string; tagId?: string };

/** The lines of the book. A filter can limit them to a range of dates and to the lines that have one tag. */
export function loadLedgerLines(db: Db, filter: LineFilter = {}): LedgerLine[] {
  const tagged = filter.tagId ? db.select({ id: lineTags.lineId }).from(lineTags).where(eq(lineTags.tagId, filter.tagId)) : undefined;
  const target = alias(accounts, "transfer_target");
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
      onBudget: accounts.onBudget,
      targetKind: target.kind,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(target, eq(target.id, transactionLines.transferAccountId))
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(
      and(
        filter.from ? gte(transactions.date, filter.from) : undefined,
        filter.through ? lte(transactions.date, filter.through) : undefined,
        tagged ? inArray(transactionLines.id, tagged) : undefined,
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
    debtAccountId: row.onBudget && row.amount < 0 && (row.targetKind === "mortgage" || row.targetKind === "loan") ? row.transferAccountId : null,
  }));
}
