import { buildInsightChanges, monthLastDay, priorMonths, type InsightChanges } from "@num/shared";
import { transactions } from "@num/db";
import { isNotNull, min } from "drizzle-orm";
import type { Db } from "../db";
import type { LedgerLine } from "./ledger-lines";
import type { Period } from "./insights-period";

/** The change month: the selected month, or the month of the last day of the period (decision 0031). */
export function changeMonth(period: Period, month: string | undefined): string {
  return month ?? period.to.slice(0, 7);
}

/** The changes of one month, with the data up to `asOf`. */
export function readInsightChanges(db: Db, facts: readonly LedgerLine[], month: string, asOf: string): InsightChanges {
  const end = monthLastDay(month);
  const through = asOf < end ? asOf : end;
  const from = `${priorMonths(month)[0]}-01`;
  const merchants = db
    .select({ merchantId: transactions.merchantId, firstDate: min(transactions.date) })
    .from(transactions)
    .where(isNotNull(transactions.merchantId))
    .groupBy(transactions.merchantId)
    .all();
  return buildInsightChanges({
    month,
    lines: facts.filter((fact) => fact.date >= from && fact.date <= through),
    merchants: merchants.flatMap(({ merchantId, firstDate }) =>
      merchantId !== null && firstDate !== null && firstDate <= through
        ? [{ merchantId, firstMonth: firstDate.slice(0, 7) }]
        : [],
    ),
  });
}
