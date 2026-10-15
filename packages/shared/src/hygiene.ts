import { z } from "zod";
import { isoDateSchema } from "./date";
import { monthKeySchema } from "./month";
import { amountSchema as money } from "./money";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const reviewAgeDays = 7 as const;

const emergencyFundCheckSchema = z.object({
  code: z.literal("emergency_fund"),
  pass: z.boolean(),
  balance: money,
  target: nonNegative,
  months: nonNegative,
  monthly: nonNegative,
});

const importFreshSchema = z.object({
  accountId: z.uuid(),
  lastImportDate: isoDateSchema.nullable(),
  ageDays: nonNegative.nullable(),
  pass: z.boolean(),
});

const importsCheckSchema = z.object({
  code: z.literal("imports_current"),
  pass: z.boolean(),
  staleImportDays: nonNegative,
  items: z.array(importFreshSchema),
});

const reviewCheckSchema = z.object({
  code: z.literal("review"),
  pass: z.boolean(),
  limitDays: z.literal(reviewAgeDays),
  oldCount: nonNegative,
  oldestDate: isoDateSchema.nullable(),
});

const savingsMonthSchema = z.object({
  month: monthKeySchema,
  savingsRateMilliPct: z.number().int().nullable(),
  savings: money,
});

const savingsRateCheckSchema = z.object({
  code: z.literal("savings_rate"),
  pass: z.boolean(),
  months: z.array(savingsMonthSchema),
});

const recurringCheckSchema = z.object({
  code: z.literal("recurring"),
  pass: z.boolean(),
  missed: nonNegative,
});

const overspentCheckSchema = z.object({
  code: z.literal("overspent"),
  pass: z.boolean(),
  unassigned: money,
  count: nonNegative,
  balance: z.number().int().max(0),
});

export const hygieneCheckSchema = z.discriminatedUnion("code", [
  emergencyFundCheckSchema,
  importsCheckSchema,
  reviewCheckSchema,
  savingsRateCheckSchema,
  recurringCheckSchema,
  overspentCheckSchema,
]);

export const hygieneSchema = z.object({
  asOf: isoDateSchema,
  /** The emergency fund check is left out when the emergency bucket is archived. */
  checks: z.array(hygieneCheckSchema),
});

export type Hygiene = z.infer<typeof hygieneSchema>;
export type HygieneCheck = z.infer<typeof hygieneCheckSchema>;
