import {
  isIsoDate,
  monthLastDay,
  reviewAgeDays,
  Temporal,
  type AccountListQuery,
  type Hygiene,
} from "@num/shared";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listAccounts } from "./accounts";
import { listOverspent } from "./buckets";
import { lastCompleteMonths } from "./complete-months";
import { emergencyBucket, readEmergencyFund } from "./emergency-fund";
import { fundingPosition } from "./funding-book";
import { recedeChecks } from "./recede-checks";
import { importFreshness, settingNumber } from "./book-settings";
import { spendTotals } from "./insights-spend";
import { loadLedgerLines } from "./ledger-lines";
import { loadReviewState, type ReviewState } from "./needs-review";

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

function ageDays(asOf: string, day: string) {
  const days = Temporal.PlainDate.from(day).until(Temporal.PlainDate.from(asOf), { largestUnit: "day" }).days;
  return days < 0 ? 0 : days;
}

function emergencyFund(db: Db, asOf: string) {
  const bucket = emergencyBucket(db);
  if (!bucket || bucket.archivedAt) {
    return [];
  }
  const fund = readEmergencyFund(db, asOf);
  if (!fund || fund.target === 0) {
    return [];
  }
  return [
    {
      code: "emergency_fund" as const,
      pass: fund.balance >= fund.target,
      balance: fund.balance,
      target: fund.target,
      months: fund.months,
    },
  ];
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

/** Missed payments. A changed amount is answered on the Buckets screen, not here (decision 0047). */
function recurring(state: ReviewState) {
  const missed = state.signals.missed.length;
  return { code: "recurring" as const, pass: missed === 0, missed };
}

/** The fill covers a negative bucket from Unassigned. The check fails when a bucket stays negative (decision 0059). */
function overspent(db: Db, asOf: string) {
  const items = listOverspent(db).items;
  const balance = items.reduce((sum, item) => sum + item.balance, 0);
  const free = fundingPosition(db, asOf).unassigned;
  return { code: "overspent" as const, pass: items.length === 0, unassigned: free, count: items.length, balance };
}

export function readHygiene(db: Db, asOf: string): Hygiene {
  requireAsOf(asOf);
  const state = loadReviewState(db, asOf);
  return {
    asOf,
    checks: [
      ...emergencyFund(db, asOf),
      ...recedeChecks(db, asOf),
      importsCurrent(db, asOf),
      reviewAge(state, asOf),
      savingsRate(db, asOf),
      recurring(state),
      overspent(db, asOf),
    ],
  };
}
