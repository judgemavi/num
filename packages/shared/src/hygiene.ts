import { z } from "zod";
import { isoDateSchema } from "./date";
import { monthKeySchema } from "./month";
import { amountSchema as money } from "./money";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const reviewAgeDays = 7 as const;

const emergencyFundCheckSchema = z.object({
  code: z.literal("emergency_fund"),
  pass: z.boolean(),
  source: z.enum(["goals", "savings"]),
  held: money,
  months: nonNegative,
  monthlyBills: nonNegative,
  monthlyRefills: nonNegative,
  need: nonNegative,
});

const cardPaidSchema = z.object({
  accountId: z.uuid(),
  statementDate: isoDateSchema.nullable(),
  dueDate: isoDateSchema.nullable(),
  owed: nonNegative,
  paid: nonNegative,
  pass: z.boolean(),
});

const cardsPaidCheckSchema = z.object({
  code: z.literal("cards_paid"),
  pass: z.boolean(),
  items: z.array(cardPaidSchema),
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

const sinkingGapSchema = z.object({
  planId: z.uuid(),
  categoryId: z.uuid().nullable(),
});

const sinkingCheckSchema = z.object({
  code: z.literal("sinking_funds"),
  pass: z.boolean(),
  yearly: nonNegative,
  missing: z.array(sinkingGapSchema),
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
  changed: nonNegative,
  missed: nonNegative,
});

const overspentCheckSchema = z.object({
  code: z.literal("overspent"),
  pass: z.boolean(),
  count: nonNegative,
  balance: z.number().int().max(0),
});

export const hygieneCheckSchema = z.discriminatedUnion("code", [
  emergencyFundCheckSchema,
  cardsPaidCheckSchema,
  importsCheckSchema,
  reviewCheckSchema,
  sinkingCheckSchema,
  savingsRateCheckSchema,
  recurringCheckSchema,
  overspentCheckSchema,
]);

export const hygieneSchema = z.object({
  asOf: isoDateSchema,
  checks: z.tuple([
    emergencyFundCheckSchema,
    cardsPaidCheckSchema,
    importsCheckSchema,
      reviewCheckSchema,
    sinkingCheckSchema,
    savingsRateCheckSchema,
    recurringCheckSchema,
    overspentCheckSchema,
  ]),
});

export type Hygiene = z.infer<typeof hygieneSchema>;
export type HygieneCheck = z.infer<typeof hygieneCheckSchema>;
