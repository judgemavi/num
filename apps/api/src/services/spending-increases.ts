import { monthLastDay, priorMonths, spendingIncreases } from "@num/shared";
import type { Db } from "../db";
import { loadLedgerLines } from "./ledger-lines";

/** The categories that went up in the month of `asOf` against their median, with the data up to `asOf`. */
export function readSpendingIncreases(db: Db, asOf: string) {
  const month = asOf.slice(0, 7);
  const end = monthLastDay(month);
  return spendingIncreases(month, loadLedgerLines(db, { from: `${priorMonths(month)[0]}-01`, through: asOf < end ? asOf : end }));
}
