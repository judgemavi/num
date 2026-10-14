import { buildInsightChanges, monthLastDay, priorMonths, type InsightChanges } from "@num/shared";
import { sql } from "drizzle-orm";
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
  const merchants = db.all<{ merchantId: string; firstDate: string }>(sql`
    select merchant_id as merchantId, min(date) as firstDate
    from transactions
    where merchant_id is not null
    group by merchant_id
  `);
  return buildInsightChanges({
    month,
    lines: facts.filter((fact) => fact.date >= from && fact.date <= through),
    merchants: merchants.flatMap((row) =>
      row.firstDate <= through ? [{ merchantId: row.merchantId, firstMonth: row.firstDate.slice(0, 7) }] : [],
    ),
  });
}
