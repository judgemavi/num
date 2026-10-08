import {
  cardStatements,
  hygieneSchema,
  inboxAgeDays,
  isIsoDate,
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
import { monthlyBills } from "./funding-book";
import { collectInbox, settingNumber } from "./inbox-collect";
import { listInbox } from "./inbox";
import { listMonths, readMonth } from "./months";
import { listPlans } from "./recurring-plans";
import { recurringSignals } from "./recurring-view";

const pageSize = 200;

function requireAsOf(asOf: string) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
}

function pagesOf<T>(load: (page: number) => { items: T[]; total: number }): T[] {
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

function ageDays(asOf: string, day: string): number {
  const days = Temporal.PlainDate.from(day).until(Temporal.PlainDate.from(asOf), { largestUnit: "day" }).days;
  return days < 0 ? 0 : days;
}

function previousMonth(asOf: string): string {
  return Temporal.PlainDate.from(asOf).with({ day: 1 }).subtract({ months: 1 }).toString().slice(0, 7);
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
      const listed = cardStatements({
        statements: ledger.statements,
        paymentDates: ledger.payments.map((payment) => payment.date),
      }).filter((item) => item.code === "statement");
      const latest = listed[listed.length - 1];
      if (!latest) {
        return { accountId: account.id, statementDate: null, dueDate: null, owed: 0, paid: 0, pass: true };
      }
      const statement = ledger.statements
        .filter((row) => row.date === latest.date)
        .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0];
      const owed = Math.max(0, -(statement?.balance ?? 0));
      const paid = ledger.payments.reduce((sum, payment) => {
        if (payment.date > latest.date && payment.date <= latest.dueDate && payment.date <= asOf) {
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
        pass: latest.dueDate > asOf || paid >= owed,
      };
    });
  return { code: "cards_paid" as const, pass: items.every((item) => item.pass), items };
}

function importsCurrent(db: Db, asOf: string) {
  const staleImportDays = settingNumber(db, "staleImportDays", 10);
  const imported = new Map(collectInbox(db, asOf).imports.map((row) => [row.accountId, row.lastImportAt]));
  const items = accounts(db)
    .filter((account) => account.onBudget)
    .map((account) => {
      const at = imported.get(account.id) ?? null;
      const lastImportDate = at ? at.slice(0, 10) : null;
      const age = lastImportDate ? ageDays(asOf, lastImportDate) : null;
      return {
        accountId: account.id,
        lastImportDate,
        ageDays: age,
        pass: age !== null && age <= staleImportDays,
      };
    });
  return { code: "imports_current" as const, pass: items.every((item) => item.pass), staleImportDays, items };
}

function monthClosed(db: Db, asOf: string) {
  const month = previousMonth(asOf);
  const listed = listMonths(db, asOf).items.find((item) => item.month === month);
  const status = listed?.status ?? "none";
  return { code: "month_closed" as const, pass: status === "closed" || status === "none", month, status };
}

function inboxAge(db: Db, asOf: string) {
  const limit = Temporal.PlainDate.from(asOf).subtract({ days: inboxAgeDays }).toString();
  const old = listInbox(db, asOf).items.filter((item) => item.date < limit);
  let oldestDate: string | null = null;
  for (const item of old) {
    if (oldestDate === null || item.date < oldestDate) {
      oldestDate = item.date;
    }
  }
  return { code: "inbox_age" as const, pass: old.length === 0, limitDays: inboxAgeDays, oldCount: old.length, oldestDate };
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

function savingsRate(db: Db, asOf: string) {
  const closed = listMonths(db, asOf).items.filter((item) => item.status === "closed").slice(0, 3);
  const months = closed.map((item) => {
    const story = readMonth(db, item.month, asOf).story;
    return { month: item.month, savingsRateMilliPct: story.savingsRateMilliPct, savings: story.savings };
  });
  return { code: "savings_rate" as const, pass: months.every((item) => item.savings >= 0), months };
}

function recurring(db: Db, asOf: string) {
  const signals = recurringSignals(db, asOf);
  return {
    code: "recurring" as const,
    pass: signals.changed.length === 0 && signals.missed.length === 0,
    changed: signals.changed.length,
    missed: signals.missed.length,
  };
}

function overspent(db: Db) {
  const items = listOverspent(db).items;
  const balance = items.reduce((sum, item) => sum + item.balance, 0);
  return { code: "overspent" as const, pass: items.length === 0, count: items.length, balance };
}

export function readHygiene(db: Db, asOf: string): Hygiene {
  requireAsOf(asOf);
  return hygieneSchema.parse({
    asOf,
    checks: [
      emergencyFund(db, asOf),
      cardsPaid(db, asOf),
      importsCurrent(db, asOf),
      monthClosed(db, asOf),
      inboxAge(db, asOf),
      sinkingFunds(db),
      savingsRate(db, asOf),
      recurring(db, asOf),
      overspent(db),
    ],
  });
}
