import { bucketCategories, buckets, categories, recurringPlans, transactionLines, transactions } from "@num/db";
import { medianAmount, monthLastDay, type EmergencyFund } from "@num/shared";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { lastCompleteMonths } from "./complete-months";
import { monthlyBills } from "./funding-book";
import type { Reader } from "./write";

const historyMonths = 6;
const fewestMonths = 3;

export function emergencyBucket(db: Reader) {
  return db.select().from(buckets).where(eq(buckets.kind, "emergency")).get();
}

/** The expense categories of the essential buckets and of the active bill plans. */
function essentialCategoryIds(db: Reader): string[] {
  const inBuckets = db
    .select({ id: bucketCategories.categoryId })
    .from(bucketCategories)
    .innerJoin(buckets, eq(bucketCategories.bucketId, buckets.id))
    .where(and(eq(buckets.essential, true), isNull(buckets.archivedAt)))
    .all();
  const inPlans = db
    .select({ id: recurringPlans.categoryId })
    .from(recurringPlans)
    .where(and(eq(recurringPlans.kind, "bill"), eq(recurringPlans.active, true), isNull(recurringPlans.archivedAt)))
    .all();
  const ids = new Set<string>();
  for (const row of [...inBuckets, ...inPlans]) {
    if (row.id) {
      ids.add(row.id);
    }
  }
  return [...ids];
}

/** The spending of each month that has expense lines in the categories. A refund decreases the spending. */
function spendingByMonth(db: Reader, categoryIds: string[], first: string, last: string) {
  if (categoryIds.length === 0) {
    return [];
  }
  const month = sql<string>`substr(${transactions.date}, 1, 7)`;
  return db
    .select({ month, spending: sql<number>`-sum(${transactionLines.amount})` })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .innerJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(
      and(
        inArray(transactionLines.categoryId, categoryIds),
        eq(categories.kind, "expense"),
        isNull(transactionLines.transferAccountId),
        gte(transactions.date, `${first}-01`),
        lte(transactions.date, monthLastDay(last)),
      ),
    )
    .groupBy(month)
    .all()
    .map((row) => row.spending);
}

/** The planned figure: the monthly amount of the active bills and the refills of the essential spending buckets. */
function plannedMonthly(db: Reader, asOf: string) {
  const refills = db
    .select({ refillTo: buckets.refillTo })
    .from(buckets)
    .where(and(eq(buckets.kind, "spending"), eq(buckets.essential, true), isNull(buckets.archivedAt)))
    .all();
  return monthlyBills(db, asOf) + refills.reduce((sum, row) => sum + (row.refillTo ?? 0), 0);
}

/**
 * The monthly essential spending (decision 0060): the median of the last 6 complete months before `asOf`. With fewer
 * than 3 complete months that have lines, the planned figure.
 */
export function monthlyEssential(db: Reader, asOf: string): { monthly: number; basis: EmergencyFund["basis"] } {
  const months = lastCompleteMonths(db, asOf, historyMonths);
  const first = months[0];
  const last = months[months.length - 1];
  const spending = first && last ? spendingByMonth(db, essentialCategoryIds(db), first, last) : [];
  if (spending.length < fewestMonths) {
    return { monthly: plannedMonthly(db, asOf), basis: "plan" };
  }
  return { monthly: medianAmount(spending, bookStep(db)), basis: "history" };
}

/** The emergency fund and its calculation. Null when the book has no emergency bucket yet (the fill makes it). */
export function readEmergencyFund(db: Reader, asOf: string): EmergencyFund | null {
  const bucket = emergencyBucket(db);
  if (!bucket || bucket.months === null || bucket.fillMonths === null) {
    return null;
  }
  const { monthly, basis } = monthlyEssential(db, asOf);
  return {
    bucketId: bucket.id,
    archived: bucket.archivedAt !== null,
    balance: bucketBalances(db).get(bucket.id) ?? 0,
    months: bucket.months,
    fillMonths: bucket.fillMonths,
    monthly,
    target: bucket.months * monthly,
    basis,
  };
}
