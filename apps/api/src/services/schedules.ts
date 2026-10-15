import { accounts, buckets, categories, merchants, occurrenceLinks, schedules, transactions, type BucketRow, type ScheduleRow } from "@num/db";
import { addDays, variableAmounts, type MonthlyCommitment, type Schedule } from "@num/shared";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { bookStep } from "./book-step";
import { ServiceError } from "../service-error";
import type { Reader, WriteTx } from "./write";

/** A schedule with the fields of its bucket. `id` is the id of the bucket. */
export type ScheduleView = Omit<ScheduleRow, "bucketId"> & {
  id: string;
  name: string;
  kind: "commitment" | "income";
  essential: boolean | null;
  archivedAt: string | null;
};

function viewOf(bucket: BucketRow, row: ScheduleRow): ScheduleView {
  const { bucketId, ...fields } = row;
  return {
    ...fields,
    id: bucketId,
    name: bucket.name,
    kind: bucket.kind === "income" ? "income" : "commitment",
    essential: bucket.essential,
    archivedAt: bucket.archivedAt,
  };
}

function selectViews(db: Reader, id?: string) {
  const rows = db
    .select({ bucket: buckets, schedule: schedules })
    .from(schedules)
    .innerJoin(buckets, eq(buckets.id, schedules.bucketId))
    .where(id ? eq(schedules.bucketId, id) : undefined)
    .all();
  return rows.map((row) => viewOf(row.bucket, row.schedule));
}

/** The schedules of the buckets that are not archived. */
export function activeSchedules(db: Reader): ScheduleView[] {
  return selectViews(db).filter((row) => row.archivedAt === null);
}

export function requireSchedule(db: Reader, id: string): ScheduleView {
  const row = selectViews(db, id)[0];
  if (!row) {
    throw new ServiceError("schedule_not_found", 404);
  }
  return row;
}

export function scheduleOf(db: Reader, id: string): Schedule | null {
  const row = db.select().from(schedules).where(eq(schedules.bucketId, id)).get();
  if (!row) {
    return null;
  }
  const { bucketId, ...fields } = row;
  return fields;
}

function assertAccount(tx: Reader, id: string) {
  const row = tx.select({ archivedAt: accounts.archivedAt }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("account_archived", 409);
  }
}

function assertCategory(tx: Reader, id: string, kind: "commitment" | "income") {
  const row = tx.select({ kind: categories.kind, archivedAt: categories.archivedAt }).from(categories).where(eq(categories.id, id)).get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("category_archived", 409);
  }
  if (row.kind !== (kind === "income" ? "income" : "expense")) {
    throw new ServiceError("bucket_fields_invalid", 400, { field: "categoryId" });
  }
}

function assertMerchant(tx: Reader, id: string) {
  const row = tx.select({ archivedAt: merchants.archivedAt }).from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("merchant_archived", 409);
  }
}

/** The records that a schedule uses must exist and must not be archived. */
export function assertScheduleRefs(tx: Reader, kind: "commitment" | "income", value: Schedule) {
  assertAccount(tx, value.accountId);
  if (value.transferAccountId) {
    assertAccount(tx, value.transferAccountId);
  }
  if (value.categoryId) {
    assertCategory(tx, value.categoryId, kind);
  }
  if (value.merchantId) {
    assertMerchant(tx, value.merchantId);
  }
}

/** Writes the schedule row of a bucket. Part of a write. */
export function putSchedule(tx: WriteTx, bucketId: string, value: Schedule) {
  tx.insert(schedules)
    .values({ bucketId, ...value })
    .onConflictDoUpdate({ target: schedules.bucketId, set: value })
    .run();
}

export type ScheduleAmounts = { forecast: number; safe: number };

/**
 * The forecast amount and the safe amount of each schedule (spec §5.7). A `fixed` schedule uses its expected amount.
 * A `variable` schedule uses the last 6 linked actual amounts on or before `asOf`.
 */
export function scheduleAmounts(db: Reader, views: readonly ScheduleView[], asOf: string): Map<string, ScheduleAmounts> {
  const step = bookStep(db);
  const variable = views.filter((view) => view.amountMode === "variable").map((view) => view.id);
  const actuals = new Map<string, number[]>();
  if (variable.length > 0) {
    const rows = db
      .select({ bucketId: occurrenceLinks.bucketId, amount: transactions.amount })
      .from(occurrenceLinks)
      .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
      .where(and(inArray(occurrenceLinks.bucketId, variable), lte(occurrenceLinks.dueDate, asOf)))
      .orderBy(desc(occurrenceLinks.dueDate))
      .all();
    for (const row of rows) {
      actuals.set(row.bucketId, [...(actuals.get(row.bucketId) ?? []), row.amount]);
    }
  }
  return new Map(
    views.map((view) => [
      view.id,
      view.amountMode === "variable"
        ? variableAmounts(actuals.get(view.id) ?? [], view.expectedAmount, step)
        : { forecast: view.expectedAmount, safe: view.expectedAmount },
    ]),
  );
}

/**
 * The schedule data of each active commitment for its monthly amount: the skipped occurrences,
 * the date of the payment of each paid occurrence, and the safe amount from the links before the month `start`
 * (YYYY-MM-DD, the first day of the month). One function gives the funding and the month plan the same figures.
 */
export function commitmentsOf(db: Reader, start: string): Map<string, MonthlyCommitment> {
  const views = activeSchedules(db).filter((view) => view.kind === "commitment");
  const amounts = scheduleAmounts(db, views, addDays(start, -1));
  const skipped = new Map<string, Set<string>>();
  const paid = new Map<string, Map<string, string>>();
  const links = db
    .select({ bucketId: occurrenceLinks.bucketId, dueDate: occurrenceLinks.dueDate, skipped: occurrenceLinks.skipped, date: transactions.date })
    .from(occurrenceLinks)
    .leftJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
    .all();
  for (const link of links) {
    if (link.skipped) {
      skipped.set(link.bucketId, (skipped.get(link.bucketId) ?? new Set()).add(link.dueDate));
    } else if (link.date) {
      paid.set(link.bucketId, (paid.get(link.bucketId) ?? new Map()).set(link.dueDate, link.date));
    }
  }
  return new Map(
    views.map((view) => [
      view.id,
      {
        schedule: view,
        amount: Math.abs(amounts.get(view.id)?.safe ?? 0),
        skipped: skipped.get(view.id) ?? new Set<string>(),
        paid: paid.get(view.id) ?? new Map<string, string>(),
      },
    ]),
  );
}
