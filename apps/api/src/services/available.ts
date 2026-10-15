import { buckets } from "@num/db";
import type { Available, BucketKind } from "@num/shared";
import { listBillNeeds } from "./bills";
import { bucketBalances } from "./bucket-balance";
import { fundingPosition } from "./funding-book";
import type { Reader } from "./write";

const savingsKinds: ReadonlySet<BucketKind> = new Set(["sinking", "goal", "emergency"]);

/**
 * Available to spend: the on-budget total − the positive balances of the savings buckets − the bills set aside. The
 * bills set aside are the positive balance of each bill + the short amount of its next payment (spec §10 Bills). A
 * negative balance counts as 0.
 */
export function readAvailable(db: Reader, asOf: string): Available {
  const { onBudgetTotal } = fundingPosition(db, asOf);
  const balances = bucketBalances(db);
  let savings = 0;
  let held = 0;
  for (const row of db.select({ id: buckets.id, kind: buckets.kind }).from(buckets).all()) {
    const positive = Math.max(0, balances.get(row.id) ?? 0);
    if (savingsKinds.has(row.kind)) {
      savings += positive;
    } else if (row.kind === "commitment") {
      held += positive;
    }
  }
  const short = listBillNeeds(db, asOf).items.reduce((sum, item) => sum + item.short, 0);
  const bills = held + short;
  return { asOf, onBudgetTotal, savings, billsSetAside: bills, available: onBudgetTotal - savings - bills };
}
