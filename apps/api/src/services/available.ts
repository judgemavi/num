import { accounts, buckets } from "@num/db";
import { isIsoDate, positiveBalances, unassigned, type Available } from "@num/shared";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { balancesOf } from "./account-balance";
import { listBillNeeds } from "./bills";
import { bucketBalances } from "./bucket-balance";
import type { Reader } from "./write";

/** The on-budget total, the bucket balances and Unassigned, all on `asOf`. */
export function positionOn(db: Reader, asOf: string) {
  const onBudget = db.select().from(accounts).where(eq(accounts.onBudget, true)).all();
  const onBudgetTotal = balancesOf(db, onBudget, asOf).reduce((total, item) => total + item.balance, 0);
  const balances = bucketBalances(db, asOf);
  return { onBudgetTotal, balances, unassigned: unassigned(onBudgetTotal, positiveBalances([...balances.values()])) };
}

/**
 * Available to spend and its parts (spec §6). Each part uses the balances on `asOf`: the accounts, the buckets and the
 * short amount of the bills (spec §10 Bills). A negative bucket balance counts as 0.
 */
export function readAvailable(db: Reader, asOf: string): Available {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const { onBudgetTotal, balances, unassigned: free } = positionOn(db, asOf);
  const totals = { savings: 0, spending: 0, held: 0 };
  for (const row of db.select({ id: buckets.id, kind: buckets.kind }).from(buckets).all()) {
    const positive = Math.max(0, balances.get(row.id) ?? 0);
    if (row.kind === "sinking" || row.kind === "goal" || row.kind === "emergency") {
      totals.savings += positive;
    } else if (row.kind === "spending") {
      totals.spending += positive;
    } else if (row.kind === "commitment") {
      totals.held += positive;
    }
  }
  const short = listBillNeeds(db, asOf).items.reduce((sum, item) => sum + item.short, 0);
  const billsSetAside = totals.held + short;
  return {
    asOf,
    onBudgetTotal,
    unassigned: free,
    savings: totals.savings,
    spending: totals.spending,
    billsSetAside,
    available: onBudgetTotal - totals.savings - billsSetAside,
  };
}
