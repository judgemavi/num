import { z } from "zod";
import { isoDateSchema } from "./date";
import { isMonthKey } from "./month";
import { centsSchema as cents } from "./money";

export const insightWindows = ["1", "3", "6", "12", "all", "custom"] as const;

export type InsightWindow = (typeof insightWindows)[number];

export const defaultInsightWindow: InsightWindow = "6";

export const insightRowKinds = ["item", "none", "uncategorized"] as const;

export type InsightRowKind = (typeof insightRowKinds)[number];

function blank(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

function windowText(value: unknown): unknown {
  return typeof value === "number" ? String(value) : blank(value);
}

const optionalDate = z.preprocess(blank, isoDateSchema.optional());
const optionalId = z.preprocess(blank, z.uuid().optional());
const optionalMonth = z.preprocess(blank, z.string().refine(isMonthKey).optional());

const insightsSearchFields = z.object({
  window: z.preprocess(windowText, z.enum(insightWindows).optional()),
  from: optionalDate,
  to: optionalDate,
  month: optionalMonth,
  group: z.preprocess(blank, z.union([z.uuid(), z.literal("none")]).optional()),
  category: optionalId,
});

function checkPeriod(value: { window?: InsightWindow; from?: string; to?: string }, context: z.RefinementCtx) {
  const custom = value.window === "custom";
  if (custom && (value.from === undefined || value.to === undefined)) {
    context.addIssue({ code: "custom", message: "A custom period needs from and to", path: ["from"] });
  }
  if (!custom && (value.from !== undefined || value.to !== undefined)) {
    context.addIssue({ code: "custom", message: "From and to are only for a custom period", path: ["window"] });
  }
}

export const insightsSearchSchema = insightsSearchFields.superRefine(checkPeriod);

export const insightsQuerySchema = insightsSearchFields.extend({ asOf: isoDateSchema }).superRefine(checkPeriod);

export type InsightsSearch = z.output<typeof insightsSearchSchema>;
export type InsightsQuery = z.output<typeof insightsQuerySchema>;

const rowSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(insightRowKinds),
  amount: cents,
  inflow: cents.nullable(),
});

const flowSchema = z.object({
  income: cents,
  spending: cents,
});

const timelineMonthSchema = z.object({
  month: z.string().refine(isMonthKey),
  actual: flowSchema.nullable(),
  forecast: flowSchema.nullable(),
});

const pointSchema = z.object({
  date: isoDateSchema,
  amount: cents,
});

const timelineSchema = z.object({
  categoryId: z.uuid().nullable(),
  months: z.array(timelineMonthSchema),
  balances: z.array(pointSchema),
  forecast: z
    .object({
      dates: z.array(isoDateSchema),
      known: z.array(cents),
      estimated: z.array(cents),
      lowest: pointSchema,
    })
    .nullable(),
});

export const insightsSchema = z.object({
  asOf: isoDateSchema,
  window: z.enum(insightWindows),
  from: isoDateSchema,
  to: isoDateSchema,
  range: z.object({ from: isoDateSchema, to: isoDateSchema }),
  income: cents,
  spending: cents,
  savings: cents,
  donut: z.array(rowSchema),
  rows: z.array(rowSchema),
  merchants: z.array(rowSchema),
  tags: z.array(rowSchema),
  timeline: timelineSchema,
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
export type InsightFlow = z.infer<typeof flowSchema>;
export type InsightTimelineMonth = z.infer<typeof timelineMonthSchema>;
export type InsightTimeline = z.infer<typeof timelineSchema>;
export type Insights = z.infer<typeof insightsSchema>;
