import {
  cardStatements,
  isIsoDate,
  monthLastDay,
  reviewAgeDays,
  Temporal,
  type AccountListQuery,
  type BucketListQuery,
  type Hygiene,
  type PlanListQuery,
} from "@num/shared";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listAccounts } from "./accounts";
import { listBuckets, listOverspent } from "./buckets";
import { cardLedger } from "./card-statements";
import { lastCompleteMonths } from "./complete-months";
import { monthlyBills } from "./funding-book";
import { importFreshness, settingNumber } from "./book-settings";
import { decidedKeys } from "./decision-keys";
import { spendTotals } from "./insights-spend";
import { loadLedgerLines } from "./ledger-lines";
import { loadReviewState, type ReviewState } from "./needs-review";
import { listPlans } from "./recurring-plans";

const pageSize = 200;

function requireAsOf(asOf: string) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
}

function pagesOf<T>(load: (page: number) => { items: T[]; total: number }) {
  const first = load(1);
  const items = [...first.items];
  let page = 2;
  while (items.length < first.total) {
    const next = load(page);
    if (next.items.length === 0) {
      break;
    }
    items.push(...next.items);
    page += 1;
  }
  return items;
}

function accounts(db: Db) {
  const query = { pageSize, archived: false, sort: "name", dir: "asc" } as const;
  return pagesOf((page) => listAccounts(db, { ...query, page } satisfies AccountListQuery));
}

function buckets(db: Db) {
  const query = { pageSize, archived: false, sort: "name", dir: "asc" } as const;
  return pagesOf((page) => listBuckets(db, { ...query, page } satisfies BucketListQuery));
}

function bills(db: Db) {
  const query = { pageSize, archived: false, sort: "name", dir: "asc", kind: "bill" } as const;
  return pagesOf((page) => listPlans(db, { ...query, page } satisfies PlanListQuery));
}

function ageDays(asOf: string, day: string) {
  const days = Temporal.PlainDate.from(day).until(Temporal.PlainDate.from(asOf), { largestUnit: "day" }).days;
  return days < 0 ? 0 : days;
}

function emergencyFund(db: Db, asOf: string) {
  const months = settingNumber(db, "emergencyFundMonths", 3);
  const rows = buckets(db);
  const goals = rows.filter((bucket) => bucket.kind === "goal" && bucket.essential);
  const refills = rows
    .filter((bucket) => bucket.kind === "spending" && bucket.essential)
    .reduce((sum, bucket) => sum + (bucket.refillTo ?? 0), 0);
  const monthly = monthlyBills(db, asOf);
  const need = months * (monthly + refills);
  const held =
    goals.length > 0
      ? goals.reduce((sum, bucket) => sum + bucket.balance, 0)
      : accounts(db)
          .filter((account) => account.kind === "savings")
          .reduce((sum, account) => sum + account.balance, 0);
  return {
    code: "emergency_fund" as const,
    pass: held >= need,
    source: goals.length > 0 ? ("goals" as const) : ("savings" as const),
    held,
    months,
    monthlyBills: monthly,
    monthlyRefills: refills,
    need,
  };
}

function cardsPaid(db: Db, asOf: string) {
  const items = accounts(db)
    .filter((account) => account.kind === "credit_card" && account.paymentPolicy === "full")
    .map((account) => {
      const ledger = cardLedger(db, account.id);
      const due = cardStatements({
        statements: ledger.statements.filter((row) => row.date <= asOf),
        paymentDates: ledger.payments.filter((payment) => payment.date <= asOf).map((payment) => payment.date),
      }).filter((item) => item.code === "statement" && item.date <= asOf && item.dueDate <= asOf);
      const latest = due[due.length - 1];
      if (!latest) {
        return { accountId: account.id, statementDate: null, dueDate: null, owed: 0, paid: 0, pass: true };
      }
      const statement = ledger.statements
        .filter((row) => row.date === latest.date)
        .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0];
      const owed = Math.max(0, -(statement?.balance ?? 0));
      const paid = ledger.payments.reduce((sum, payment) => {
        if (payment.date > latest.date && payment.date <= latest.dueDate) {
          return sum + payment.amount;
        }
        return sum;
      }, 0);
      return {
        accountId: account.id,
        statementDate: latest.date,
        dueDate: latest.dueDate,
        owed,
        paid,
        pass: paid >= owed,
      };
    });
  return { code: "cards_paid" as const, pass: items.every((item) => item.pass), items };
}

function importsCurrent(db: Db, asOf: string) {
  const staleImportDays = settingNumber(db, "staleImportDays", 10);
  const imported = new Map(importFreshness(db, asOf).map((row) => [row.accountId, row.lastImportAt]));
  const items = accounts(db)
    .filter((account) => account.onBudget)
    .map((account) => {
      const at = imported.get(account.id) ?? null;
      const lastImportDate = at && at.slice(0, 10) <= asOf ? at.slice(0, 10) : null;
      const age = lastImportDate ? ageDays(asOf, lastImportDate) : null;
      return {
        accountId: account.id,
        lastImportDate,
        ageDays: age,
        pass: age === null || age <= staleImportDays,
      };
    });
  return { code: "imports_current" as const, pass: items.every((item) => item.pass), staleImportDays, items };
}

function reviewAge(state: ReviewState, asOf: string) {
  const limit = Temporal.PlainDate.from(asOf).subtract({ days: reviewAgeDays }).toString();
  const old = state.hits.filter((item) => item.date < limit);
  let oldestDate: string | null = null;
  for (const item of old) {
    if (oldestDate === null || item.date < oldestDate) {
      oldestDate = item.date;
    }
  }
  return { code: "review" as const, pass: old.length === 0, limitDays: reviewAgeDays, oldCount: old.length, oldestDate };
}

function sinkingFunds(db: Db) {
  const covered = new Set(
    buckets(db)
      .filter((bucket) => bucket.kind === "sinking")
      .flatMap((bucket) => bucket.categoryIds),
  );
  const yearly = bills(db).filter((plan) => plan.active && plan.freq === "yearly");
  const missing = yearly
    .filter((plan) => plan.categoryId === null || !covered.has(plan.categoryId))
    .map((plan) => ({ planId: plan.id, categoryId: plan.categoryId }));
  return { code: "sinking_funds" as const, pass: missing.length === 0, yearly: yearly.length, missing };
}

/** The last 3 complete months, newest first (decision 0031). */
function savingsRate(db: Db, asOf: string) {
  const months = lastCompleteMonths(db, asOf, 3).reverse();
  const oldest = months[months.length - 1];
  const newest = months[0];
  const facts = oldest && newest ? loadLedgerLines(db, { from: `${oldest}-01`, through: monthLastDay(newest) }) : [];
  const rows = months.map((month) => {
    const totals = spendTotals(facts, { from: `${month}-01`, to: monthLastDay(month) });
    return { month, savingsRateMilliPct: totals.savingsRateMilliPct, savings: totals.savings };
  });
  return { code: "savings_rate" as const, pass: rows.every((item) => item.savings >= 0), months: rows };
}

function recurring(db: Db, state: ReviewState) {
  const hidden = decidedKeys(db, "recurring_changed");
  const signals = state.signals;
  const changed = signals.changed.filter((item) => !hidden.has(`recurring_changed:${item.planId}:${item.dueDate}`)).length;
  const missed = signals.missed.length;
  return { code: "recurring" as const, pass: changed === 0 && missed === 0, changed, missed };
}

function overspent(db: Db) {
  const items = listOverspent(db).items;
  const balance = items.reduce((sum, item) => sum + item.balance, 0);
  return { code: "overspent" as const, pass: items.length === 0, count: items.length, balance };
}

export function readHygiene(db: Db, asOf: string): Hygiene {
  requireAsOf(asOf);
  const state = loadReviewState(db, asOf);
  return {
    asOf,
    checks: [
      emergencyFund(db, asOf),
      cardsPaid(db, asOf),
      importsCurrent(db, asOf),
      reviewAge(state, asOf),
      sinkingFunds(db),
      savingsRate(db, asOf),
      recurring(db, state),
      overspent(db),
    ],
  };
}
