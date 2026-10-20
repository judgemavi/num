import type { ImportBatchRow } from "@num/db";
import type { AccountKind, BalanceCheck } from "@num/shared";
import { clearedBalancesAt } from "./account-balance";
import type { Reader } from "./write";

type CheckedBatch = Pick<ImportBatchRow, "closingBalance" | "closingDate" | "matchedBefore" | "undoneAt"> & {
  account: { id: string; kind: AccountKind; openingBalance: number };
};

/**
 * The balance check of each batch, in the order of the input, with one query for the cleared balances.
 * A batch without a closing balance, or an undone batch, has no check.
 */
export function balanceChecksOf(db: Reader, batches: readonly CheckedBatch[]): BalanceCheck[] {
  const points = batches.flatMap((batch, index) =>
    batch.undoneAt === null && batch.closingBalance !== null && batch.closingDate !== null
      ? [{ index, account: batch.account, date: batch.closingDate, closingBalance: batch.closingBalance, matchedBefore: batch.matchedBefore }]
      : [],
  );
  const cleared = clearedBalancesAt(db, points);
  const checks: BalanceCheck[] = batches.map(() => null);
  for (const [position, point] of points.entries()) {
    const balance = cleared[position];
    if (balance === undefined) throw new Error("Balance is missing");
    checks[point.index] = { difference: balance - point.closingBalance, matchedBefore: point.matchedBefore };
  }
  return checks;
}
