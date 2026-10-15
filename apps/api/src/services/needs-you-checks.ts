import { monthLastDay, reviewAgeDays, staleImportDays, Temporal, type AccountListQuery } from "@num/shared";
import type { Db } from "../db";
import { listAccounts } from "./accounts";
import { listOverspent } from "./buckets";
import { lastCompleteMonths } from "./complete-months";
import { emergencyBucket, readEmergencyFund } from "./emergency-fund";
import { poolChecks } from "./pool-checks";
import { billsShortCheck } from "./bills";
import { importFreshness } from "./book-settings";
import { spendTotals } from "./insights-spend";
import { loadLedgerLines } from "./ledger-lines";
import { loadReviewState, type ReviewState } from "./needs-review";

const pageSize = 200;

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
  const imported = new Map(importFreshness(db, asOf).map((row) => [row.accountId, row.lastImportAt]));
  const items = accounts(db)
    .filter((account) => account.onBudget)
    .map((account) => {
      const at = imported.get(account.id) ?? null;
      const age = at && at.slice(0, 10) <= asOf ? ageDays(asOf, at.slice(0, 10)) : null;
      return { accountId: account.id, ageDays: age, pass: age === null || age <= staleImportDays };
    });
  return { code: "imports_current" as const, pass: items.every((item) => item.pass), items };
}

function reviewAge(state: ReviewState, asOf: string) {
  const limit = Temporal.PlainDate.from(asOf).subtract({ days: reviewAgeDays }).toString();
  const oldCount = state.hits.filter((item) => item.date < limit).length;
  return { code: "review" as const, pass: oldCount === 0, oldCount };
}

/** The last 3 complete months, newest first. */
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

/** The fill covers a negative bucket from Unassigned. The check fails when a bucket stays negative. */
function overspent(db: Db) {
  const items = listOverspent(db).items;
  const balance = items.reduce((sum, item) => sum + item.balance, 0);
  return { code: "overspent" as const, pass: items.length === 0, count: items.length, balance };
}

/**
 * The checks of Needs you (§10). Needs you shows a check only when it fails. `state` is the review state that the
 * caller already read.
 */
export function needsYouChecks(db: Db, asOf: string, state: ReviewState = loadReviewState(db, asOf)) {
  return [
    ...emergencyFund(db, asOf),
    billsShortCheck(db, asOf),
    ...poolChecks(db, asOf),
    importsCurrent(db, asOf),
    reviewAge(state, asOf),
    savingsRate(db, asOf),
    overspent(db),
  ];
}

export type NeedsYouCheck = ReturnType<typeof needsYouChecks>[number];
