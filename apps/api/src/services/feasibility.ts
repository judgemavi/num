import { buckets } from "@num/db";
import { addDays, buildFeasibility, isIsoDate } from "@num/shared";
import { isNull } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { activeSchedules, scheduleAmounts } from "./schedules";
import type { Reader } from "./write";

/**
 * Goal feasibility for the month of `asOf` (spec §7.8). The buckets use their balance on the day before the month
 * starts, thus funding and spending inside the month do not change it.
 */
export function readFeasibility(db: Reader, asOf: string, suppliedBalances?: ReadonlyMap<string, number>) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const month = asOf.slice(0, 7);
  const balances = suppliedBalances ?? bucketBalances(db, addDays(`${month}-01`, -1));
  const active = activeSchedules(db);
  const amounts = scheduleAmounts(db, active, asOf);
  const schedules = active.map((schedule) => ({ kind: schedule.kind, safe: Math.abs(amounts.get(schedule.id)?.safe ?? 0), schedule }));
  const rows = db
    .select()
    .from(buckets)
    .where(isNull(buckets.archivedAt))
    .all()
    .filter((row) => row.kind === "spending" || row.kind === "sinking" || row.kind === "goal")
    .map((row) => ({ ...row, paused: row.pausedAt !== null, commitment: null, balance: balances.get(row.id) ?? 0 }));
  return { asOf, feasibility: buildFeasibility({ month, schedules, buckets: rows, step: bookStep(db) }) };
}
