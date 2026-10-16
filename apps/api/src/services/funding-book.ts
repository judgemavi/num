import { accounts } from "@num/db";
import { divideAmount, occurrenceDates, positiveBalances, Temporal, unassigned } from "@num/shared";
import { eq } from "drizzle-orm";
import { balancesOf } from "./account-balance";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { scheduleAmounts, type ScheduleView } from "./schedules";
import type { Reader } from "./write";

/** The on-budget total, the bucket balances and Unassigned, all on `asOf`. Each Unassigned of the app comes from here. */
export function positionOn(db: Reader, asOf: string, balances = bucketBalances(db, asOf)) {
  const onBudget = db.select().from(accounts).where(eq(accounts.onBudget, true)).all();
  const accountBalances = new Map(balancesOf(db, onBudget, asOf).map((item) => [item.account.id, item.balance]));
  const onBudgetTotal = [...accountBalances.values()].reduce((total, balance) => total + balance, 0);
  return { onBudgetTotal, accountBalances, balances, unassigned: unassigned(onBudgetTotal, positiveBalances([...balances.values()])) };
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
