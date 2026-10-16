import { fillPlan } from "@num/shared";
import { bookStep } from "./book-step";
import { createFundingReads } from "./funding-reads";
import { loadLinkIndex } from "./link-index";
import { activeSchedules, scheduleAmounts } from "./schedules";
import type { Reader } from "./write";

/** The shared fill plan, from the current position and monthly owed amounts. Read again after a cover. */
export function fundingPlan(db: Reader, asOf: string, reads = createFundingReads(db, asOf)) {
  const schedules = activeSchedules(db);
  const amounts = scheduleAmounts(db, schedules, asOf);
  const closed = loadLinkIndex(db).closedDates;
  const scheduleData = new Map(schedules.map((schedule) => [schedule.id, {
    schedule,
    startDate: schedule.startDate,
    closed: closed.get(schedule.id) ?? new Set<string>(),
  }]));
  return fillPlan({
    asOf,
    step: bookStep(db),
    unassigned: reads.position.unassigned,
    incomes: schedules.filter((schedule) => schedule.kind === "income").flatMap((schedule) => {
      const data = scheduleData.get(schedule.id);
      return data ? [data] : [];
    }),
    buckets: reads.monthlyRows().map(({ bucket, monthly, funded, owed }) => {
      const data = scheduleData.get(bucket.id);
      return {
        id: bucket.id,
        kind: bucket.kind,
        priority: bucket.priority,
        essential: bucket.essential,
        paused: bucket.pausedAt !== null,
        monthly,
        funded,
        owed,
        balance: reads.position.balances.get(bucket.id) ?? 0,
        commitment: bucket.kind === "commitment" && data
          ? { ...data, startDate: bucket.startDate, amount: Math.abs(amounts.get(bucket.id)?.safe ?? 0) }
          : null,
      };
    }),
  });
}
