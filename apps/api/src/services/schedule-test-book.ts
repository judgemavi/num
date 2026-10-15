import type { Bucket, Schedule } from "@num/shared";
import type { Db } from "../db";
import { createBucket } from "./buckets";
import type { WriteInput } from "./write";

type ScheduleInput = Partial<Pick<Schedule, "categoryId" | "transferAccountId" | "merchantId" | "monthDay" | "endDate" | "payday">> &
  Pick<Schedule, "accountId" | "expectedAmount" | "tolerance" | "amountMode" | "startDate" | "freq" | "interval" | "businessDayShift"> & {
    name: string;
    kind: "commitment" | "income";
    /** The start date of the bucket (spec §5.8). The default is early, thus every payment counts. */
    bucketStartDate?: string;
    essential?: boolean;
    priority?: number;
  };

/** A commitment or an income bucket with its schedule, for tests. */
export function createSchedule(db: Db, input: ScheduleInput & WriteInput): Bucket {
  const { name, kind, bucketStartDate, essential, priority, source, at, ...schedule } = input;
  return createBucket(db, {
    name,
    kind,
    priority: priority ?? 0,
    essential: essential ?? kind === "commitment",
    color: "sky",
    icon: "wallet",
    categoryIds: [],
    startDate: bucketStartDate ?? "2000-01-01",
    refillTo: null,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    fillMonths: null,
    schedule: {
      categoryId: null,
      transferAccountId: null,
      merchantId: null,
      monthDay: null,
      endDate: null,
      payday: false,
      ...schedule,
    },
    asOf: "2000-01-01",
    source,
    at,
  });
}
