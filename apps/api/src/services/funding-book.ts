import { accounts, bucketEvents, buckets, fundingRuns, occurrenceLinks, recurringPlans, transactions } from "@num/db";
import {
  accountKinds,
  addDays,
  billReserveDays,
  Temporal,
  billsReserved,
  bucketKinds,
  businessDayShifts,
  fundingLimit,
  fundingProposal,
  isIsoDate,
  nextIncomeDate,
  occurrenceDates,
  planFrequencies,
  positiveBalances,
  unassigned,
  type AccountKind,
  type BucketKind,
  type BusinessDayShift,
  type FundingIncome,
  type FundingPaycheck,
  type ReservedBill,
  type FundingPosition,
  type FundingProposal,
  type PlanFrequency,
  type PlanSchedule,
} from "@num/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { balanceOf, latestValuations, transactionTotals } from "./account-balance";
import { bucketBalances, type Reader } from "./bucket-balance";

type PlanRow = typeof recurringPlans.$inferSelect;
type BucketRow = typeof buckets.$inferSelect;

function accountKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function bucketKind(value: string): BucketKind {
  if (!(bucketKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown bucket kind");
  }
  return value as BucketKind;
}

function amountMode(value: string): FundingPaycheck["amountMode"] {
  if (value !== "fixed" && value !== "variable") {
    throw new Error("Unknown amount mode");
  }
  return value;
}

function scheduleOf(row: PlanRow): PlanSchedule {
  if (!(planFrequencies as readonly string[]).includes(row.freq)) {
    throw new Error("Unknown frequency");
  }
  if (!(businessDayShifts as readonly string[]).includes(row.businessDayShift)) {
    throw new Error("Unknown shift");
  }
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: row.freq as PlanFrequency,
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as BusinessDayShift,
  };
}

function linkKeys(db: Reader): { skipped: Set<string>; linked: Set<string> } {
  const skipped = new Set<string>();
  const linked = new Set<string>();
  for (const row of db.select().from(occurrenceLinks).all()) {
    const key = `${row.planId}|${row.dueDate}`;
    linked.add(key);
    if (row.skipped) {
      skipped.add(key);
    }
  }
  return { skipped, linked };
}

function incomePlans(rows: PlanRow[]): PlanRow[] {
  return rows.filter((row) => row.kind === "income" && row.fundsBuckets && row.active && row.archivedAt === null);
}

function hits(plans: PlanRow[], from: string, to: string, skipped: Set<string>): FundingIncome[] {
  if (to < from) {
    return [];
  }
  const items: FundingIncome[] = [];
  for (const plan of plans) {
    for (const date of occurrenceDates(scheduleOf(plan), to, from)) {
      if (skipped.has(`${plan.id}|${date.dueDate}`)) {
        continue;
      }
      items.push({ planId: plan.id, dueDate: date.dueDate });
    }
  }
  return items;
}

function onBudgetTotal(db: Reader): number {
  const totals = transactionTotals(db);
  const latest = latestValuations(db);
  let total = 0;
  for (const row of db.select().from(accounts).all()) {
    if (!row.onBudget) {
      continue;
    }
    total += balanceOf(db, { id: row.id, kind: accountKind(row.kind), openingBalance: row.openingBalance }, totals, latest);
  }
  return total;
}

export function fundingPosition(db: Reader, asOf: string): FundingPosition {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const allPlans = db.select().from(recurringPlans).all();
  const { skipped, linked } = linkKeys(db);
  const far = addDays(asOf, 40 * 366);
  const next = nextIncomeDate(
    asOf,
    hits(incomePlans(allPlans), asOf, far, skipped).map((item) => item.dueDate),
  );
  const end = next ?? addDays(asOf, billReserveDays);
  const last = addDays(end, -1);
  const bills: ReservedBill[] = [];
  if (last >= asOf) {
    for (const plan of allPlans) {
      if (plan.kind !== "bill" || !plan.active || plan.archivedAt !== null) {
        continue;
      }
      for (const date of occurrenceDates(scheduleOf(plan), last, asOf)) {
        bills.push({
          dueDate: date.dueDate,
          amount: plan.expectedAmount,
          linked: linked.has(`${plan.id}|${date.dueDate}`),
        });
      }
    }
  }
  const reserved = billsReserved(asOf, bills, next);
  const balances = bucketBalances(db);
  const total = onBudgetTotal(db);
  return {
    asOf,
    onBudgetTotal: total,
    billsReserved: reserved,
    unassigned: unassigned(total, positiveBalances([...balances.values()]), reserved),
    nextIncomeDate: next,
  };
}

export function requirePaycheck(db: Reader, incomeTransactionId: string): FundingPaycheck & { planId: string } {
  const txn = db.select().from(transactions).where(eq(transactions.id, incomeTransactionId)).get();
  if (!txn || txn.deletedAt !== null || txn.amount <= 0) {
    throw new ServiceError("paycheck_not_found", 404);
  }
  const link = db.select().from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, incomeTransactionId)).get();
  if (!link || link.skipped || link.transactionId === null) {
    throw new ServiceError("paycheck_not_found", 404);
  }
  const plan = db.select().from(recurringPlans).where(eq(recurringPlans.id, link.planId)).get();
  if (!plan || plan.kind !== "income" || !plan.fundsBuckets) {
    throw new ServiceError("paycheck_not_found", 404);
  }
  return {
    incomeTransactionId: txn.id,
    date: txn.date,
    dueDate: link.dueDate,
    amount: txn.amount,
    payee: txn.payeeRaw,
    amountMode: amountMode(plan.amountMode),
    planId: plan.id,
  };
}

export function activeFundingRun(db: Reader, incomeTransactionId: string) {
  return db
    .select()
    .from(fundingRuns)
    .where(and(eq(fundingRuns.incomeTransactionId, incomeTransactionId), isNull(fundingRuns.undoneAt)))
    .get();
}

export function listFundingPaychecks(db: Db): { items: FundingPaycheck[] } {
  const funded = new Set(
    db
      .select()
      .from(fundingRuns)
      .all()
      .filter((run) => run.undoneAt === null)
      .map((run) => run.incomeTransactionId),
  );
  const items: FundingPaycheck[] = [];
  for (const link of db.select().from(occurrenceLinks).all()) {
    if (link.skipped || link.transactionId === null || funded.has(link.transactionId)) {
      continue;
    }
    try {
      const paycheck = requirePaycheck(db, link.transactionId);
      items.push({
        incomeTransactionId: paycheck.incomeTransactionId,
        date: paycheck.date,
        dueDate: paycheck.dueDate,
        amount: paycheck.amount,
        payee: paycheck.payee,
        amountMode: paycheck.amountMode,
      });
    } catch (error) {
      if (error instanceof ServiceError && error.code === "paycheck_not_found") {
        continue;
      }
      throw error;
    }
  }
  items.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return left.incomeTransactionId < right.incomeTransactionId ? 1 : -1;
  });
  return { items };
}

function proposalIncomes(db: Reader, dueDate: string, bucketRows: BucketRow[]): FundingIncome[] {
  const month = Temporal.PlainDate.from(dueDate).with({ day: 1 });
  const start = month.toString();
  let end = month.add({ months: 1 }).subtract({ days: 1 }).toString();
  for (const bucket of bucketRows) {
    const date = bucket.dueDate ?? bucket.targetDate;
    if (date && date > end) {
      end = date;
    }
  }
  return hits(incomePlans(db.select().from(recurringPlans).all()), start, end, linkKeys(db).skipped);
}

export function fundingProposalFor(db: Reader, incomeTransactionId: string, asOf: string): FundingProposal {
  const paycheck = requirePaycheck(db, incomeTransactionId);
  if (activeFundingRun(db, paycheck.incomeTransactionId)) {
    throw new ServiceError("funding_run_exists", 409);
  }
  const position = fundingPosition(db, asOf);
  const bucketRows = db.select().from(buckets).all();
  const balances = bucketBalances(db);
  const lines = fundingProposal({
    paycheckPlanId: paycheck.planId,
    paycheckDate: paycheck.dueDate,
    paycheckAmount: paycheck.amount,
    unassigned: position.unassigned,
    incomes: proposalIncomes(db, paycheck.dueDate, bucketRows),
    buckets: bucketRows.map((row) => ({
      id: row.id,
      kind: bucketKind(row.kind),
      priority: row.priority,
      balance: balances.get(row.id) ?? 0,
      archived: row.archivedAt !== null,
      refillTo: row.refillTo,
      amount: row.amount,
      dueDate: row.dueDate,
      target: row.target,
      targetDate: row.targetDate,
      fixedAmount: row.fixedAmount,
    })),
  });
  const names = new Map(bucketRows.map((row) => [row.id, row.name]));
  return {
    incomeTransactionId: paycheck.incomeTransactionId,
    date: paycheck.date,
    dueDate: paycheck.dueDate,
    payee: paycheck.payee,
    paycheckAmount: paycheck.amount,
    unassigned: position.unassigned,
    limit: fundingLimit(paycheck.amount, position.unassigned),
    lines: lines.map((line) => ({
      bucketId: line.bucketId,
      name: names.get(line.bucketId) ?? "",
      amount: line.amount,
    })),
  };
}

export function runTotals(db: Reader): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of db.select().from(bucketEvents).all()) {
    if (!event.fundingRunId) {
      continue;
    }
    totals.set(event.fundingRunId, (totals.get(event.fundingRunId) ?? 0) + event.amount);
  }
  return totals;
}
