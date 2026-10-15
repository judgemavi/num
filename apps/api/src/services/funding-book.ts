import { accounts, occurrenceLinks } from "@num/db";
import {
  addDays,
  divideAmount,
  isIsoDate,
  nextIncomeDate,
  occurrenceDates,
  positiveBalances,
  Temporal,
  unassigned,
  type FundingPosition,
} from "@num/shared";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { balancesOf } from "./account-balance";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { activeSchedules, scheduleAmounts, type ScheduleView } from "./schedules";
import type { Reader } from "./write";

function skippedKeys(db: Reader) {
  return new Set(
    db
      .select()
      .from(occurrenceLinks)
      .all()
      .filter((link) => link.skipped)
      .map((link) => `${link.bucketId}|${link.dueDate}`),
  );
}

/** The next occurrence of an income with `payday` after `asOf` (spec §6). An occurrence on `asOf` is the current payday. */
export function nextPayday(schedules: readonly ScheduleView[], skipped: ReadonlySet<string>, asOf: string): string | null {
  const start = addDays(asOf, 1);
  const horizon = Temporal.PlainDate.from(asOf).add({ years: 1 }).toString();
  const dates: string[] = [];
  for (const schedule of schedules) {
    if (schedule.kind !== "income" || !schedule.payday) {
      continue;
    }
    const next = occurrenceDates(schedule, horizon, start).find((date) => !skipped.has(`${schedule.id}|${date.dueDate}`));
    if (next) {
      dates.push(next.dueDate);
    }
  }
  return nextIncomeDate(asOf, dates);
}

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
    nextIncomeDate: nextPayday(activeSchedules(db), skippedKeys(db), asOf),
  };
}

/** The yearly amount of a schedule divided by 12, with its safe amount (decision 0062 item 10). */
export function yearlyShare(db: Reader, schedules: readonly ScheduleView[], asOf: string): number {
  const end = Temporal.PlainDate.from(asOf).add({ months: 12 }).subtract({ days: 1 }).toString();
  const amounts = scheduleAmounts(db, schedules, asOf);
  let total = 0;
  for (const schedule of schedules) {
    total += Math.abs(amounts.get(schedule.id)?.safe ?? 0) * occurrenceDates(schedule, end, asOf).length;
  }
  return divideAmount(total, 12, bookStep(db));
}
