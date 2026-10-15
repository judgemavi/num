import { completeMonths } from "@num/shared";
import type { Reader } from "./write";
import { firstTransactionDate } from "./insights-period";

/** The last `count` complete months before `asOf`, oldest first. */
export function lastCompleteMonths(db: Reader, asOf: string, count: number): string[] {
  return completeMonths(asOf, firstTransactionDate(db), count);
}
