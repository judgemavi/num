import { accounts, buckets, fundingRuns, occurrenceLinks, recurringPlans, transactions } from "@num/db";
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
  divideHalfAway,
  occurrenceDates,
  planFrequencies,
  positiveBalances,
  unassigned,
  variableAmounts,
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
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { balanceOf, latestValuations, transactionTotals } from "./account-balance";
import { bucketBalances, type Reader } from "./bucket-balance";

type PlanRow = typeof recurringPlans.$inferSelect;
type BucketRow = typeof buckets.$inferSelect;
type LinkRow = typeof occurrenceLinks.$inferSelect;

type Book = {
  plans: PlanRow[];
  links: LinkRow[];
  skipped: Set<string>;
  linked: Set<string>;
  buckets: BucketRow[];
  balances: Map<string, number>;
  amounts: Map<string, number>;
  payees: Map<string, { date: string; payee: string; amount: number }>;
};

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

export function amountMode(value: string): FundingPaycheck["amountMode"] {
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

function loadBook(db: Reader): Book {
  const plans = db.select().from(recurringPlans).all();
  const links = db.select().from(occurrenceLinks).all();
  const skipped = new Set<string>();
  const linked = new Set<string>();
  const txnIds: string[] = [];
  for (const row of links) {
    const key = `${row.planId}|${row.dueDate}`;
    linked.add(key);
    if (row.skipped) {
      skipped.add(key);
    }
    if (row.transactionId) {
      txnIds.push(row.transactionId);
    }
  }
  const amounts = new Map<string, number>();
  const payees = new Map<string, { date: string; payee: string; amount: number }>();
  if (txnIds.length > 0) {
    const rows = db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        date: transactions.date,
        payeeRaw: transactions.payeeRaw,
      })
      .from(transactions)
      .where(inArray(transactions.id, txnIds))
      .all();
    for (const row of rows) {
      amounts.set(row.id, row.amount);
      payees.set(row.id, { date: row.date, payee: row.payeeRaw, amount: row.amount });
    }
  }
  return {
    plans,
    links,
    skipped,
    linked,
    buckets: db.select().from(buckets).all(),
    balances: bucketBalances(db),
    amounts,
    payees,
  };
}

function firstIncomeAfter(plans: PlanRow[], skipped: Set<string>, asOf: string): string | null {
  const start = addDays(asOf, 1);
  const horizon = Temporal.PlainDate.from(asOf).add({ years: 1 }).toString();
  const dates: string[] = [];
  for (const plan of plans) {
    for (const date of occurrenceDates(scheduleOf(plan), horizon, start)) {
      if (skipped.has(`${plan.id}|${date.dueDate}`)) {
        continue;
      }
      dates.push(date.dueDate);
      break;
    }
  }
  return nextIncomeDate(asOf, dates);
}

function billAmount(plan: PlanRow, book: Book, asOf: string): number {
  if (plan.amountMode !== "variable") {
    return plan.expectedAmount;
  }
  const actuals = book.links
    .filter((link) => link.planId === plan.id && link.transactionId !== null && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => {
      const amount = link.transactionId ? book.amounts.get(link.transactionId) : undefined;
      return amount === undefined ? [] : [amount];
    });
  return variableAmounts(actuals, plan.expectedAmount).safe;
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

function positionFrom(db: Reader, asOf: string, book: Book): FundingPosition {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const next = firstIncomeAfter(incomePlans(book.plans), book.skipped, asOf);
  const end = next ?? addDays(asOf, billReserveDays);
  const last = addDays(end, -1);
  const bills: ReservedBill[] = [];
  if (last >= asOf) {
    for (const plan of book.plans) {
      if (plan.kind !== "bill" || !plan.active || plan.archivedAt !== null) {
        continue;
      }
      const amount = billAmount(plan, book, asOf);
      for (const date of occurrenceDates(scheduleOf(plan), last, asOf)) {
        bills.push({
          dueDate: date.dueDate,
          amount,
          linked: book.linked.has(`${plan.id}|${date.dueDate}`),
        });
      }
    }
  }
  const reserved = billsReserved(asOf, bills, next);
  const total = onBudgetTotal(db);
  return {
    asOf,
    onBudgetTotal: total,
    billsReserved: reserved,
    unassigned: unassigned(total, positiveBalances([...book.balances.values()]), reserved),
    nextIncomeDate: next,
  };
}

export function fundingPosition(db: Reader, asOf: string): FundingPosition {
  return positionFrom(db, asOf, loadBook(db));
}

export function monthlyBills(db: Reader, asOf: string): number {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const book = loadBook(db);
  const end = Temporal.PlainDate.from(asOf).add({ months: 12 }).subtract({ days: 1 }).toString();
  let total = 0;
  for (const plan of book.plans) {
    if (plan.kind !== "bill" || !plan.active || plan.archivedAt !== null) {
      continue;
    }
    const count = occurrenceDates(scheduleOf(plan), end, asOf).length;
    total += Math.abs(billAmount(plan, book, asOf)) * count;
  }
  return divideHalfAway(total, 12);
}

export function requirePaycheck(db: Reader, incomeTransactionId: string): FundingPaycheck & { planId: string } {
  const txn = db.select().from(transactions).where(eq(transactions.id, incomeTransactionId)).get();
  if (!txn || txn.amount <= 0) {
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

function proposalIncomes(book: Book, dueDate: string): FundingIncome[] {
  const month = Temporal.PlainDate.from(dueDate).with({ day: 1 });
  const start = month.toString();
  let end = month.add({ months: 1 }).subtract({ days: 1 }).toString();
  for (const bucket of book.buckets) {
    const date = bucket.dueDate ?? bucket.targetDate;
    if (date && date > end) {
      end = date;
    }
  }
  return hits(incomePlans(book.plans), start, end, book.skipped);
}

function paycheckFromBook(book: Book, incomeTransactionId: string): FundingPaycheck & { planId: string } {
  const link = book.links.find((row) => row.transactionId === incomeTransactionId);
  const txn = book.payees.get(incomeTransactionId);
  if (!link || link.skipped || link.transactionId === null || !txn || txn.amount <= 0) {
    throw new ServiceError("paycheck_not_found", 404);
  }
  const plan = book.plans.find((row) => row.id === link.planId);
  if (!plan || plan.kind !== "income" || !plan.fundsBuckets) {
    throw new ServiceError("paycheck_not_found", 404);
  }
  return {
    incomeTransactionId,
    date: txn.date,
    dueDate: link.dueDate,
    amount: txn.amount,
    payee: txn.payee,
    amountMode: amountMode(plan.amountMode),
    planId: plan.id,
  };
}

export function fundingProposalFor(db: Reader, incomeTransactionId: string, asOf: string): FundingProposal {
  const book = loadBook(db);
  const paycheck = paycheckFromBook(book, incomeTransactionId);
  if (activeFundingRun(db, paycheck.incomeTransactionId)) {
    throw new ServiceError("funding_run_exists", 409);
  }
  const position = positionFrom(db, asOf, book);
  const lines = fundingProposal({
    paycheckPlanId: paycheck.planId,
    paycheckDate: paycheck.dueDate,
    paycheckAmount: paycheck.amount,
    unassigned: position.unassigned,
    incomes: proposalIncomes(book, paycheck.dueDate),
    buckets: book.buckets.map((row) => ({
      id: row.id,
      kind: bucketKind(row.kind),
      priority: row.priority,
      balance: book.balances.get(row.id) ?? 0,
      archived: row.archivedAt !== null,
      refillTo: row.refillTo,
      amount: row.amount,
      dueDate: row.dueDate,
      target: row.target,
      targetDate: row.targetDate,
      fixedAmount: row.fixedAmount,
    })),
  });
  const names = new Map(book.buckets.map((row) => [row.id, row.name]));
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
