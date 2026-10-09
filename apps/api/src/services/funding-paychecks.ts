import { fundingRuns, occurrenceLinks, recurringPlans, transactions } from "@num/db";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { decidedKeys } from "./decision-keys";
import { amountMode } from "./funding-book";

export function listFundingPaychecks(db: Db) {
  const hidden = decidedKeys(db, "paycheck_funding");
  const rows = db
    .select({
      incomeTransactionId: transactions.id,
      date: transactions.date,
      dueDate: occurrenceLinks.dueDate,
      amount: transactions.amount,
      payee: transactions.payeeRaw,
      amountMode: recurringPlans.amountMode,
    })
    .from(occurrenceLinks)
    .innerJoin(recurringPlans, eq(occurrenceLinks.planId, recurringPlans.id))
    .innerJoin(transactions, eq(occurrenceLinks.transactionId, transactions.id))
    .leftJoin(fundingRuns, and(eq(fundingRuns.incomeTransactionId, transactions.id), isNull(fundingRuns.undoneAt)))
    .where(
      and(
        eq(recurringPlans.kind, "income"),
        eq(recurringPlans.fundsBuckets, true),
        eq(occurrenceLinks.skipped, false),
        isNotNull(occurrenceLinks.transactionId),
        gt(transactions.amount, 0),
        isNull(fundingRuns.id),
      ),
    )
    .all();
  const items = rows.map((row) => ({
    incomeTransactionId: row.incomeTransactionId,
    date: row.date,
    dueDate: row.dueDate,
    amount: row.amount,
    payee: row.payee,
    amountMode: amountMode(row.amountMode),
    kept: hidden.has(`paycheck_funding:${row.incomeTransactionId}`),
  }));
  items.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return left.incomeTransactionId < right.incomeTransactionId ? 1 : -1;
  });
  return { items };
}

/** Paychecks that still ask to be funded. A recorded "keep it unassigned" stops the question. */
export function openFundingPaychecks(db: Db) {
  return listFundingPaychecks(db).items.filter((item) => !item.kept);
}
