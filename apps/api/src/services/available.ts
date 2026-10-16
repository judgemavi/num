import { buckets } from "@num/db";
import { type Available } from "@num/shared";
import { listBillNeeds } from "./bills";
import { createFundingReads } from "./funding-reads";
import type { Reader } from "./write";

/**
 * Available to spend and its parts (spec §6). Each part uses the balances on `asOf`: the accounts, the buckets and the
 * gap of the bills (spec §10 Bills): the whole gap, also the part that Unassigned covers. A negative bucket balance counts as 0.
 */
export function readAvailable(db: Reader, asOf: string): Available {
  const reads = createFundingReads(db, asOf);
  const { onBudgetTotal, balances, unassigned: free } = reads.position;
  const totals = { savings: 0, held: 0 };
  for (const row of db.select({ id: buckets.id, kind: buckets.kind }).from(buckets).all()) {
    const positive = Math.max(0, balances.get(row.id) ?? 0);
    if (row.kind === "sinking" || row.kind === "goal" || row.kind === "emergency") {
      totals.savings += positive;
    } else if (row.kind === "commitment") {
      totals.held += positive;
    }
  }
  // The whole gap: the part that Unassigned covers is not free to spend.
  const gap = listBillNeeds(db, asOf, reads).items.reduce((sum, item) => sum + item.gap, 0);
  const billsSetAside = totals.held + gap;
  return {
    asOf,
    onBudgetTotal,
    unassigned: free,
    savings: totals.savings,
    billsSetAside,
    available: onBudgetTotal - totals.savings - billsSetAside,
  };
}
