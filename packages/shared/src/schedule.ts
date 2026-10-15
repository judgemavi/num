import { z } from "zod";
import { isoDateSchema } from "./date";
import { amountSchema } from "./money";
import { amountModes, businessDayShifts, planFrequencies } from "./recurring-calc";

export const toleranceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const monthDaySchema = z
  .number()
  .int()
  .refine((day) => day === -1 || (day >= 1 && day <= 31));

/** The schedule of a commitment or an income bucket (spec §5.7). */
export const scheduleSchema = z.object({
  accountId: z.uuid(),
  expectedAmount: amountSchema,
  tolerance: toleranceSchema,
  amountMode: z.enum(amountModes),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  merchantId: z.uuid().nullable(),
  startDate: isoDateSchema,
  freq: z.enum(planFrequencies),
  interval: z.number().int().min(1),
  monthDay: monthDaySchema.nullable(),
  businessDayShift: z.enum(businessDayShifts),
  endDate: isoDateSchema.nullable(),
});

export type Schedule = z.infer<typeof scheduleSchema>;

/** The fields of a schedule that break the rules of §5.7. The kind is `commitment` or `income`. */
export function scheduleIssues(kind: "commitment" | "income", schedule: Schedule): (keyof Schedule)[] {
  const issues: (keyof Schedule)[] = [];
  // A commitment is money out and an income is money in.
  if (kind === "commitment" ? schedule.expectedAmount > 0 : schedule.expectedAmount < 0) {
    issues.push("expectedAmount");
  }
  if (kind === "income" && schedule.transferAccountId !== null) {
    issues.push("transferAccountId");
  }
  if (kind === "commitment" && schedule.transferAccountId !== null) {
    if (schedule.transferAccountId === schedule.accountId) {
      issues.push("transferAccountId");
    }
    if (schedule.categoryId !== null) {
      issues.push("categoryId");
    }
  }
  if (schedule.freq === "weekly" && schedule.monthDay !== null) {
    issues.push("monthDay");
  }
  if (schedule.endDate !== null && schedule.endDate < schedule.startDate) {
    issues.push("endDate");
  }
  return issues;
}
