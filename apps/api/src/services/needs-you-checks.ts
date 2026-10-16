import { daysBetween, monthLastDay, reviewAgeDays, staleImportDays, Temporal } from "@num/shared";
import type { Db } from "../db";
import { listOverspent } from "./buckets";
import { lastCompleteMonths } from "./complete-months";
import { createFundingReads, type FundingReads } from "./funding-reads";
import { poolChecks } from "./pool-checks";
import { billsShortCheck } from "./bills";
import { importFreshness } from "./book-settings";
import { spendTotals } from "./insights-spend";
import { loadLedgerLines } from "./ledger-lines";
import { loadReviewState, type ReviewState } from "./needs-review";

function ageDays(asOf: string, day: string) {
  const days = daysBetween(day, asOf);
  return days < 0 ? 0 : days;
}

function emergencyFund(reads: FundingReads) {
  const fund = reads.emergencyFund();
  if (!fund || fund.archived || fund.target === 0) {
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
  const items = importFreshness(db, asOf)
    .filter((account) => account.onBudget)
    .map((account) => {
      const at = account.lastImportedOn;
      const age = at && at <= asOf ? ageDays(asOf, at) : null;
      return { accountId: account.accountId, ageDays: age, pass: age === null || age <= staleImportDays };
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
function overspent(db: Db, reads: FundingReads) {
  const items = listOverspent(db, reads.balancesOn()).items;
  const balance = items.reduce((sum, item) => sum + item.balance, 0);
  return { code: "overspent" as const, pass: items.length === 0, count: items.length, balance };
}

/**
 * The checks of Needs you (§10). Needs you shows a check only when it fails. `state` is the review state that the
 * caller already read.
 */
export function needsYouChecks(db: Db, asOf: string, state: ReviewState = loadReviewState(db, asOf), reads = createFundingReads(db, asOf)) {
  return [
    ...emergencyFund(reads),
    billsShortCheck(db, asOf, reads),
    ...poolChecks(db, asOf, reads),
    importsCurrent(db, asOf),
    reviewAge(state, asOf),
    savingsRate(db, asOf),
    overspent(db, reads),
  ];
}

export type NeedsYouCheck = ReturnType<typeof needsYouChecks>[number];
