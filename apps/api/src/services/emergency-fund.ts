import { bucketCategories, buckets, categories, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { medianAmount, monthLastDay, type EmergencyFund } from "@num/shared";
import { and, eq, gte, inArray, isNotNull, isNull, lte, notExists, sql } from "drizzle-orm";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { lastCompleteMonths } from "./complete-months";
import { yearlyShare } from "./funding-book";
import { activeSchedules } from "./schedules";
import type { Reader } from "./write";

const historyMonths = 6;
const fewestMonths = 3;

export function emergencyBucket(db: Reader) {
  return db.select().from(buckets).where(eq(buckets.kind, "emergency")).get();
}

/** The expense categories of the active essential spending buckets. Only a commitment or a spending bucket has `essential`. */
function essentialCategoryIds(db: Reader): string[] {
  return db
    .select({ id: bucketCategories.categoryId })
    .from(bucketCategories)
    .innerJoin(buckets, eq(bucketCategories.bucketId, buckets.id))
    .where(and(eq(buckets.kind, "spending"), eq(buckets.essential, true), isNull(buckets.archivedAt)))
    .all()
    .map((row) => row.id);
}

const month = sql<string>`substr(${transactions.date}, 1, 7)`;

const linkedToCommitment = (db: Reader) =>
  db
    .select({ id: occurrenceLinks.id })
    .from(occurrenceLinks)
    .innerJoin(buckets, eq(buckets.id, occurrenceLinks.bucketId))
    .where(and(eq(occurrenceLinks.transactionId, transactions.id), eq(buckets.kind, "commitment")));

/** The outflow of each month of the payments that are linked to the active essential commitments (the full amount). */
function paymentsByMonth(db: Reader, first: string, last: string) {
  return db
    .select({ month, spending: sql<number>`-sum(${transactions.amount})` })
    .from(occurrenceLinks)
    .innerJoin(buckets, eq(buckets.id, occurrenceLinks.bucketId))
    .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
    .where(
      and(
        isNotNull(occurrenceLinks.transactionId),
        eq(buckets.kind, "commitment"),
        eq(buckets.essential, true),
        isNull(buckets.archivedAt),
        gte(transactions.date, `${first}-01`),
        lte(transactions.date, monthLastDay(last)),
      ),
    )
    .groupBy(month)
    .all();
}

/**
 * The spending of each month in the categories, without the transactions that are linked to a commitment. A refund
 * decreases the spending.
 */
function categorySpendingByMonth(db: Reader, categoryIds: string[], first: string, last: string) {
  if (categoryIds.length === 0) {
    return [];
  }
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
        notExists(linkedToCommitment(db)),
      ),
    )
    .groupBy(month)
    .all();
}

/** The spending of each month that has a linked payment or an expense line. Each transaction counts one time. */
function spendingByMonth(db: Reader, first: string, last: string) {
  const totals = new Map<string, number>();
  for (const row of [...paymentsByMonth(db, first, last), ...categorySpendingByMonth(db, essentialCategoryIds(db), first, last)]) {
    totals.set(row.month, (totals.get(row.month) ?? 0) + row.spending);
  }
  return [...totals.values()];
}

/** The planned figure: the yearly amount / 12 of the essential commitments and the refills of the essential spending buckets. */
function plannedMonthly(db: Reader, asOf: string) {
  const refills = db
    .select({ refillTo: buckets.refillTo })
    .from(buckets)
    .where(and(eq(buckets.kind, "spending"), eq(buckets.essential, true), isNull(buckets.archivedAt)))
    .all();
  const commitments = activeSchedules(db).filter((schedule) => schedule.kind === "commitment" && schedule.essential);
  return yearlyShare(db, commitments, asOf) + refills.reduce((sum, row) => sum + (row.refillTo ?? 0), 0);
}

/**
 * The monthly essential spending: the median of the last 6 complete months before `asOf`. With fewer
 * than 3 complete months that have lines, the planned figure.
 */
export function monthlyEssential(db: Reader, asOf: string): { monthly: number; basis: EmergencyFund["basis"] } {
  const months = lastCompleteMonths(db, asOf, historyMonths);
  const first = months[0];
  const last = months[months.length - 1];
  const spending = first && last ? spendingByMonth(db, first, last) : [];
  if (spending.length < fewestMonths) {
    return { monthly: plannedMonthly(db, asOf), basis: "plan" };
  }
  return { monthly: medianAmount(spending, bookStep(db)), basis: "history" };
}

/** The emergency fund and its calculation on `asOf`. Null when the book has no emergency bucket. */
export function readEmergencyFund(db: Reader, asOf: string): EmergencyFund | null {
  const bucket = emergencyBucket(db);
  if (!bucket || bucket.months === null) {
    return null;
  }
  const { monthly, basis } = monthlyEssential(db, asOf);
  return {
    bucketId: bucket.id,
    archived: bucket.archivedAt !== null,
    balance: bucketBalances(db, asOf).get(bucket.id) ?? 0,
    months: bucket.months,
    monthly,
    target: bucket.months * monthly,
    basis,
  };
}
