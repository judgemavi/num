import { z } from "zod";
import { isoDateSchema } from "./date";
import { isMonthKey } from "./month";
import { centsSchema as cents } from "./money";


export const insightBreakdowns = ["category", "group", "merchant", "tag"] as const;

export type InsightBreakdown = (typeof insightBreakdowns)[number];

export const insightRowKinds = ["item", "none", "uncategorized"] as const;

export type InsightRowKind = (typeof insightRowKinds)[number];

function blank(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalDate = z.preprocess(blank, isoDateSchema.optional());
const optionalId = z.preprocess(blank, z.uuid().optional());

export const insightsSearchSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  by: z.preprocess(blank, z.enum(insightBreakdowns).optional()),
  categoryId: optionalId,
});

export const insightsQuerySchema = insightsSearchSchema.extend({
  asOf: isoDateSchema,
});

export type InsightsSearch = z.output<typeof insightsSearchSchema>;
export type InsightsQuery = z.output<typeof insightsQuerySchema>;

const rowSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(insightRowKinds),
  amount: cents,
  inflow: cents.nullable(),
});

const monthPoint = z.object({
  month: z.string().refine(isMonthKey),
  spending: cents,
  income: cents,
});

export const insightsSchema = z.object({
  asOf: isoDateSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  by: z.enum(insightBreakdowns),
  income: cents,
  spending: cents,
  savings: cents,
  rows: z.array(rowSchema),
  trend: z.array(monthPoint).length(12),
  categoryTrend: z
    .array(
      z.object({
        month: z.string().refine(isMonthKey),
        spending: cents,
      }),
    )
    .length(12)
    .nullable(),
  netWorth: z
    .array(
      z.object({
        month: z.string().refine(isMonthKey),
        date: isoDateSchema,
        assets: cents,
        liabilities: cents,
        net: cents,
      }),
    )
    .length(24),
});

export type InsightRow = z.infer<typeof rowSchema>;
export type Insights = z.infer<typeof insightsSchema>;
