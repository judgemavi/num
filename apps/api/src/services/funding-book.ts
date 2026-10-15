import { accounts, buckets, occurrenceLinks, recurringPlans, transactions, type BucketRow, type OccurrenceLinkRow, type RecurringPlanRow } from "@num/db";
import {
  addDays,
  billReserveDays,
  Temporal,
  billsReserved,
  isIsoDate,
  nextIncomeDate,
  divideAmount,
  occurrenceDates,
  positiveBalances,
  unassigned,
  variableAmounts,
  type ReservedBill,
  type FundingPosition,
} from "@num/shared";
import { eq, inArray } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { balancesOf } from "./account-balance";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import type { Reader } from "./write";

export type Book = {
  plans: RecurringPlanRow[];
  links: OccurrenceLinkRow[];
  skipped: Set<string>;
  linked: Set<string>;
  buckets: BucketRow[];
  balances: Map<string, number>;
  amounts: Map<string, number>;
  /** The milliunits in one minor unit of the book currency. */
  step: number;
};

export function loadBook(db: Reader): Book {
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
  if (txnIds.length > 0) {
    const rows = db
      .select({
        id: transactions.id,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(inArray(transactions.id, txnIds))
      .all();
    for (const row of rows) {
      amounts.set(row.id, row.amount);
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
    step: bookStep(db),
  };
}

function firstIncomeAfter(plans: RecurringPlanRow[], skipped: Set<string>, asOf: string) {
  const start = addDays(asOf, 1);
  const horizon = Temporal.PlainDate.from(asOf).add({ years: 1 }).toString();
  const dates: string[] = [];
  for (const plan of plans) {
    for (const date of occurrenceDates(plan, horizon, start)) {
      if (skipped.has(`${plan.id}|${date.dueDate}`)) {
        continue;
      }
      dates.push(date.dueDate);
      break;
    }
  }
  return nextIncomeDate(asOf, dates);
}

function billAmount(plan: RecurringPlanRow, book: Book, asOf: string) {
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
  return variableAmounts(actuals, plan.expectedAmount, book.step).safe;
}

export function incomePlans(rows: RecurringPlanRow[]): RecurringPlanRow[] {
  return rows.filter((row) => row.kind === "income" && row.fundsBuckets && row.active && row.archivedAt === null);
}

function onBudgetTotal(db: Reader) {
  const rows = db.select().from(accounts).where(eq(accounts.onBudget, true)).all();
  return balancesOf(db, rows).reduce((total, item) => total + item.balance, 0);
}

export function positionFrom(db: Reader, asOf: string, book: Book) {
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
      for (const date of occurrenceDates(plan, last, asOf)) {
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
    const count = occurrenceDates(plan, end, asOf).length;
    total += Math.abs(billAmount(plan, book, asOf)) * count;
  }
  return divideAmount(total, 12, book.step);
}
