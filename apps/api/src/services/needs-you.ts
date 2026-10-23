import { addDays, type NeedsYou, type NeedsYouItem } from "@num/shared";
import type { Db } from "../db";
import { createFundingReads } from "./funding-reads";
import { listBankStatuses } from "./bank-balances";
import { countImportsNeedingYou } from "./import-list";
import { needsYouChecks, type NeedsYouCheck } from "./needs-you-checks";
import { readFeasibility } from "./feasibility";
import { loadReviewState, requireAsOf } from "./needs-review";

/** The emergency fund below its target, the savings used this month, and the pool short ahead. */
function poolItems(failed: readonly NeedsYouCheck[]): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  const fund = failed.find((check) => check.code === "emergency_fund");
  if (fund) {
    items.push({ code: "emergency_fund", balance: fund.balance, target: fund.target, months: fund.months });
  }
  const used = failed.find((check) => check.code === "savings_used");
  if (used) {
    items.push({ code: "savings_used", total: used.total, items: used.items });
  }
  const pool = failed.find((check) => check.code === "pool_short");
  if (pool && pool.date !== null) {
    items.push({ code: "pool_short", date: pool.date, short: pool.short, pause: pool.pause, recede: pool.recede, uncovered: pool.uncovered });
  }
  return items;
}

/**
 * Home "Needs you": only the items that need the user, in the order of Home. A check (§10) shows here only when it
 * fails.
 */
export function readNeedsYou(db: Db, asOf: string): NeedsYou {
  requireAsOf(asOf);
  const state = loadReviewState(db, asOf);
  const reads = createFundingReads(db, asOf);
  const failed = needsYouChecks(db, asOf, state, reads).filter((check) => !check.pass);
  const items: NeedsYouItem[] = [];
  if (state.hits.length > 0) {
    const old = failed.find((check) => check.code === "review");
    items.push({ code: "review", count: state.hits.length, oldCount: old?.oldCount ?? 0 });
  }
  const importReviews = countImportsNeedingYou(db);
  if (importReviews > 0) {
    items.push({ code: "imports_review", count: importReviews });
  }
  for (const status of listBankStatuses(db).items) {
    if (status.difference !== 0) {
      items.push({ code: "bank_mismatch", accountId: status.accountId, difference: status.difference });
    }
  }
  const imports = failed.find((check) => check.code === "imports_current");
  if (imports) {
    const stale = imports.items.flatMap((item) => (!item.pass && item.ageDays !== null ? [{ accountId: item.accountId, ageDays: item.ageDays }] : []));
    items.push({ code: "imports_stale", items: stale });
  }
  for (const missed of state.signals.missed) {
    items.push({ code: "missed", bucketId: missed.bucketId, dueDate: missed.dueDate });
  }
  const overspent = failed.find((check) => check.code === "overspent");
  if (overspent) {
    items.push({ code: "overspent", count: overspent.count, balance: overspent.balance });
  }
  const shortfall = readFeasibility(db, asOf, reads.balancesOn(addDays(`${asOf.slice(0, 7)}-01`, -1))).feasibility?.shortfall ?? 0;
  if (shortfall > 0) {
    items.push({ code: "goals_short", shortfall });
  }
  for (const bill of failed.find((check) => check.code === "bills_short")?.items ?? []) {
    items.push({ code: "bills_short", ...bill });
  }
  items.push(...poolItems(failed));
  const savings = failed.find((check) => check.code === "savings_rate");
  if (savings) {
    items.push({ code: "savings_rate", savingsRateMilliPct: savings.savingsRateMilliPct });
  }
  return { asOf, items };
}
