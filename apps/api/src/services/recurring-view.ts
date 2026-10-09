import { occurrenceLinks, recurringPlans, settings, transactions } from "@num/db";
import {
  Temporal,
  detectPlans,
  isInboxMissed,
  linkWindowStart,
  matchLinks,
  occurrenceDates,
  variableAmounts,
  withinTolerance,
  type DetectionTransaction,
  type Occurrence,
  type OccurrenceStatus,
  type OpenOccurrence,
  type PlanSchedule,
  type RecurringSignals,
} from "@num/shared";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { applyLinkedPlan } from "./match-apply";
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

function transactionsByIds(db: Db, ids: readonly string[]): Map<string, TxnRow> {
  const found = new Map<string, TxnRow>();
  for (let index = 0; index < ids.length; index += 400) {
    const slice = ids.slice(index, index + 400);
    if (slice.length === 0) {
      continue;
    }
    const rows = db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        merchantId: transactions.merchantId,
      })
      .from(transactions)
      .where(and(inArray(transactions.id, slice)))
      .all();
    for (const row of rows) {
      found.set(row.id, row);
    }
  }
  return found;
}

function transactionsForAccounts(db: Db, accountIds: readonly string[], from: string, to: string): TxnRow[] {
  const rows: TxnRow[] = [];
  for (const accountId of accountIds) {
    rows.push(
      ...db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          date: transactions.date,
          amount: transactions.amount,
          merchantId: transactions.merchantId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            gte(transactions.date, from),
            lte(transactions.date, to),
          ),
        )
        .all(),
    );
  }
  return rows;
}

function detectionTransactions(db: Db, asOf: string): DetectionTransaction[] {
  const since = Temporal.PlainDate.from(asOf).subtract({ months: 18 }).toString();
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      merchantId: transactions.merchantId,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(and(isNotNull(transactions.merchantId), gte(transactions.date, since), lte(transactions.date, asOf)))
    .all()
    .flatMap((row) => (row.merchantId ? [{ ...row, merchantId: row.merchantId }] : []));
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
  if (row.active && isInboxMissed(dueDate, asOf, grace)) {
    return "missed";
  }
  return "open";
}

export function listOccurrences(db: Db, planId: string, asOf: string) {
  const row = requirePlan(db, planId);
  const grace = graceDays(db);
  const links = db.select().from(occurrenceLinks).where(eq(occurrenceLinks.planId, planId)).all();
  const byDue = new Map(links.map((link) => [link.dueDate, link]));
  const txns = transactionsByIds(
    db,
    links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])),
  );
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

function openOccurrences(rows: PlanRow[], links: LinkRow[], asOf: string, grace: number): OpenOccurrence[] {
  const linked = new Set(links.map((link) => `${link.planId}|${link.dueDate}`));
  const limit = Temporal.PlainDate.from(asOf).add({ days: grace }).toString();
  const occurrences: OpenOccurrence[] = [];
  for (const row of rows) {
    const from = linkWindowStart(row.startDate, asOf);
    for (const date of occurrenceDates(scheduleOf(row), limit, from)) {
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

function linkTransactions(db: Db, plans: PlanRow[], asOf: string, grace: number): TxnRow[] {
  const accountIds = [...new Set(plans.map((row) => row.accountId))];
  const from = Temporal.PlainDate.from(asOf).subtract({ months: 13 }).subtract({ days: grace }).toString();
  const to = Temporal.PlainDate.from(asOf).add({ days: grace * 2 }).toString();
  return transactionsForAccounts(db, accountIds, from, to);
}

export function recurringSignals(db: Db, asOf: string): RecurringSignals {
  const plans = activePlans(db);
  const links = db.select().from(occurrenceLinks).all();
  const grace = graceDays(db);
  const linkedIds = links.flatMap((link) => (link.transactionId ? [link.transactionId] : []));
  const txnById = transactionsByIds(db, linkedIds);
  const changed: RecurringSignals["changed"] = [];
  const missed: RecurringSignals["missed"] = [];
  const missedFrom = Temporal.PlainDate.from(asOf).subtract({ days: 35 }).toString();
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
    for (const date of occurrenceDates(scheduleOf(row), asOf, missedFrom)) {
      if (byDue.has(date.dueDate) || !isInboxMissed(date.dueDate, asOf, grace)) {
        continue;
      }
      missed.push({ planId: row.id, dueDate: date.dueDate });
    }
  }
  const taken = new Set(linkedIds);
  const candidates = linkTransactions(db, plans, asOf, grace).filter((txn) => !taken.has(txn.id));
  const ambiguous = matchLinks(openOccurrences(plans, links, asOf, grace), candidates, grace).ambiguous;
  const covered = new Set(plans.filter((row) => row.merchantId).map((row) => `${row.accountId}|${row.merchantId}`));
  const proposals = detectPlans(detectionTransactions(db, asOf), asOf).filter(
    (proposal) => !covered.has(`${proposal.accountId}|${proposal.merchantId}`),
  );
  return { changed, missed, ambiguous, proposals };
}

export function autoLink(db: Db, asOf: string, input: WriteInput & { accountId?: string }): { linked: number } {
  const plans = activePlans(db).filter((row) => !input.accountId || row.accountId === input.accountId);
  const links = db.select().from(occurrenceLinks).all();
  const grace = graceDays(db);
  const taken = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const unique = matchLinks(
    openOccurrences(plans, links, asOf, grace),
    linkTransactions(db, plans, asOf, grace).filter((txn) => !taken.has(txn.id)),
    grace,
  ).unique;
  if (unique.length === 0) {
    return { linked: 0 };
  }
  const byPlan = new Map(plans.map((plan) => [plan.id, plan]));
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const pair of unique) {
      const plan = byPlan.get(pair.planId);
      if (plan) {
        applyLinkedPlan(tx, plan, pair.transactionId);
      }
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
