import { accounts } from "@num/db";
import { divideAmount, isIsoDate, occurrenceDates, positiveBalances, Temporal, unassigned, type FundingPosition } from "@num/shared";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { balancesOf } from "./account-balance";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { scheduleAmounts, type ScheduleView } from "./schedules";
import type { Reader } from "./write";

function onBudgetTotal(db: Reader) {
  const rows = db.select().from(accounts).where(eq(accounts.onBudget, true)).all();
  return balancesOf(db, rows).reduce((total, item) => total + item.balance, 0);
}

export function fundingPosition(db: Reader, asOf: string): FundingPosition {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const total = onBudgetTotal(db);
  return {
    asOf,
    onBudgetTotal: total,
    unassigned: unassigned(total, positiveBalances([...bucketBalances(db).values()])),
  };
}

/** The yearly amount of a schedule divided by 12, with its safe amount. */
export function yearlyShare(db: Reader, schedules: readonly ScheduleView[], asOf: string): number {
  const end = Temporal.PlainDate.from(asOf).add({ months: 12 }).subtract({ days: 1 }).toString();
  const amounts = scheduleAmounts(db, schedules, asOf);
  let total = 0;
  for (const schedule of schedules) {
    total += Math.abs(amounts.get(schedule.id)?.safe ?? 0) * occurrenceDates(schedule, end, asOf).length;
  }
  return divideAmount(total, 12, bookStep(db));
}
