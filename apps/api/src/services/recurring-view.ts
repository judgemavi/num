import { occurrenceLinks, recurringPlans, settings, transactions } from "@num/db";
import {
  Temporal,
  detectPlans,
  isMissed,
  matchLinks,
  occurrenceDates,
  variableAmounts,
  withinTolerance,
  type Occurrence,
  type OccurrenceStatus,
  type OpenOccurrence,
  type PlanSchedule,
  type RecurringSignals,
} from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type PlanRow = typeof recurringPlans.$inferSelect;
type LinkRow = typeof occurrenceLinks.$inferSelect;

type TxnRow = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  merchantId: string | null;
};

const horizonDays = 400;

function scheduleOf(row: PlanRow): PlanSchedule {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: row.freq as PlanSchedule["freq"],
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as PlanSchedule["businessDayShift"],
  };
}

function graceDays(db: { select: Db["select"] }): number {
  const row = db.select().from(settings).where(eq(settings.key, "recurringGraceDays")).get();
  const value = Number(row?.value ?? "3");
  if (!Number.isInteger(value) || value < 0) {
    return 3;
  }
  return value;
}

function horizon(asOf: string): string {
  return Temporal.PlainDate.from(asOf).add({ days: horizonDays }).toString();
}

function activePlans(db: Db): PlanRow[] {
  return db
    .select()
    .from(recurringPlans)
    .all()
    .filter((row) => row.active && row.archivedAt === null);
}

function liveTransactions(db: Db): TxnRow[] {
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
}

function requirePlan(db: Db, id: string): PlanRow {
  const row = db.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get();
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  return row;
}

function linkSnapshot(row: LinkRow) {
  return {
    planId: row.planId,
    dueDate: row.dueDate,
    transactionId: row.transactionId,
    skipped: row.skipped,
    reason: row.reason,
  };
}

function amountsByDue(links: LinkRow[], txns: Map<string, TxnRow>, asOf: string): number[] {
  return links
    .filter((link) => link.transactionId && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => {
      const txn = link.transactionId ? txns.get(link.transactionId) : undefined;
      return txn ? [txn.amount] : [];
    });
}

function statusFor(
  row: PlanRow,
  dueDate: string,
  asOf: string,
  grace: number,
  link: LinkRow | undefined,
  actual: number | null,
): OccurrenceStatus {
  if (link?.skipped) {
    return "skipped";
  }
  if (link?.transactionId) {
    if (row.amountMode === "fixed" && actual !== null && !withinTolerance(actual, row.expectedAmount, row.tolerance)) {
      return "changed";
    }
    return "linked";
  }
  if (row.active && isMissed(dueDate, asOf, grace)) {
    return "missed";
  }
  return "open";
}

export function listOccurrences(db: Db, planId: string, asOf: string) {
  const row = requirePlan(db, planId);
  const grace = graceDays(db);
  const links = db.select().from(occurrenceLinks).where(eq(occurrenceLinks.planId, planId)).all();
  const byDue = new Map(links.map((link) => [link.dueDate, link]));
  const txns = new Map(liveTransactions(db).map((txn) => [txn.id, txn]));
  const actuals = amountsByDue(links, txns, asOf);
  const amounts =
    row.amountMode === "variable" ? variableAmounts(actuals, row.expectedAmount) : { forecast: row.expectedAmount, safe: row.expectedAmount };
  const items: Occurrence[] = occurrenceDates(scheduleOf(row), horizon(asOf)).map((date) => {
    const link = byDue.get(date.dueDate);
    const txn = link?.transactionId ? txns.get(link.transactionId) : undefined;
    const actual = txn ? txn.amount : null;
    return {
      dueDate: date.dueDate,
      nominalDate: date.nominalDate,
      status: statusFor(row, date.dueDate, asOf, grace, link, actual),
      transactionId: link?.transactionId ?? null,
      actualAmount: actual,
      reason: link?.reason ?? null,
    };
  });
  return { forecastAmount: amounts.forecast, safeAmount: amounts.safe, items };
}

function openOccurrences(rows: PlanRow[], links: LinkRow[], txns: TxnRow[], asOf: string, grace: number): OpenOccurrence[] {
  const linked = new Set(links.map((link) => `${link.planId}|${link.dueDate}`));
  let latest = asOf;
  for (const txn of txns) {
    if (txn.date > latest) {
      latest = txn.date;
    }
  }
  const limit = Temporal.PlainDate.from(latest).add({ days: grace }).toString();
  const occurrences: OpenOccurrence[] = [];
  for (const row of rows) {
    for (const date of occurrenceDates(scheduleOf(row), limit)) {
      if (linked.has(`${row.id}|${date.dueDate}`)) {
        continue;
      }
      occurrences.push({
        planId: row.id,
        dueDate: date.dueDate,
        accountId: row.accountId,
        merchantId: row.merchantId,
        expectedAmount: row.expectedAmount,
        tolerance: row.tolerance,
      });
    }
  }
  return occurrences;
}

export function recurringSignals(db: Db, asOf: string): RecurringSignals {
  const plans = activePlans(db);
  const links = db.select().from(occurrenceLinks).all();
  const txns = liveTransactions(db);
  const txnById = new Map(txns.map((txn) => [txn.id, txn]));
  const grace = graceDays(db);
  const changed: RecurringSignals["changed"] = [];
  const missed: RecurringSignals["missed"] = [];
  for (const row of plans) {
    const planLinks = links.filter((link) => link.planId === row.id);
    const byDue = new Map(planLinks.map((link) => [link.dueDate, link]));
    if (row.amountMode === "fixed") {
      for (const link of planLinks) {
        if (!link.transactionId) {
          continue;
        }
        const txn = txnById.get(link.transactionId);
        if (!txn || withinTolerance(txn.amount, row.expectedAmount, row.tolerance)) {
          continue;
        }
        changed.push({
          planId: row.id,
          dueDate: link.dueDate,
          transactionId: txn.id,
          expectedAmount: row.expectedAmount,
          actualAmount: txn.amount,
        });
      }
    }
    for (const date of occurrenceDates(scheduleOf(row), asOf)) {
      if (byDue.has(date.dueDate) || !isMissed(date.dueDate, asOf, grace)) {
        continue;
      }
      missed.push({ planId: row.id, dueDate: date.dueDate });
    }
  }
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const ambiguous = matchLinks(
    openOccurrences(plans, links, txns, asOf, grace),
    txns.filter((txn) => !taken.has(txn.id)),
    grace,
  ).ambiguous;
  const covered = new Set(plans.filter((row) => row.merchantId).map((row) => `${row.accountId}|${row.merchantId}`));
  const proposals = detectPlans(
    txns.flatMap((txn) => (txn.merchantId ? [{ ...txn, merchantId: txn.merchantId }] : [])),
  ).filter((proposal) => !covered.has(`${proposal.accountId}|${proposal.merchantId}`));
  return { changed, missed, ambiguous, proposals };
}

export function autoLink(db: Db, asOf: string, input: WriteInput): { linked: number } {
  const plans = activePlans(db);
  const links = db.select().from(occurrenceLinks).all();
  const txns = liveTransactions(db);
  const grace = graceDays(db);
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const unique = matchLinks(
    openOccurrences(plans, links, txns, asOf, grace),
    txns.filter((txn) => !taken.has(txn.id)),
    grace,
  ).unique;
  if (unique.length === 0) {
    return { linked: 0 };
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const pair of unique) {
      const id = crypto.randomUUID();
      const row: LinkRow = {
        id,
        planId: pair.planId,
        dueDate: pair.dueDate,
        transactionId: pair.transactionId,
        skipped: false,
        reason: null,
      };
      tx.insert(occurrenceLinks).values(row).run();
      tx.audit({
        entity: "occurrence_links",
        entityId: id,
        action: "link",
        before: null,
        after: linkSnapshot(row),
      });
    }
  });
  return { linked: unique.length };
}
