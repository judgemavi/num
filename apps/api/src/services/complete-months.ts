import { completeMonths } from "@num/shared";
import type { Db } from "../db";
import { firstTransactionDate } from "./insights-period";

/** The last `count` complete months before `asOf`, oldest first (decision 0031). */
export function lastCompleteMonths(db: Db, asOf: string, count: number): string[] {
  return completeMonths(asOf, firstTransactionDate(db), count);
}
