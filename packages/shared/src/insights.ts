import { z } from "zod";
import { isoDateSchema } from "./date";
import { optionalQuery, queryDate, queryId, queryIdOrNone } from "./list";
import { isMonthKey } from "./month";
import { amountSchema as money } from "./money";

export const insightWindows = ["1", "3", "6", "12", "all", "custom"] as const;

export type InsightWindow = (typeof insightWindows)[number];

export const defaultInsightWindow: InsightWindow = "1";

export const insightRowKinds = ["item", "none", "uncategorized"] as const;

export type InsightRowKind = (typeof insightRowKinds)[number];

const insightsSearchFields = z.object({
  window: optionalQuery(z.enum(insightWindows)),
  from: queryDate,
  to: queryDate,
  month: optionalQuery(z.string().refine(isMonthKey)),
  group: queryIdOrNone,
  category: queryId,
});

const insightsRequestFields = insightsSearchFields.omit({ group: true });

function checkPeriod(value: { window?: InsightWindow; from?: string; to?: string }, context: z.RefinementCtx) {
  const custom = value.window === "custom";
  if (custom && (value.from === undefined || value.to === undefined)) {
    context.addIssue({ code: "custom", message: "A custom period needs from and to", path: ["window"] });
  }
  if (!custom && (value.from !== undefined || value.to !== undefined)) {
    context.addIssue({ code: "custom", message: "From and to are only for a custom period", path: ["window"] });
  }
}

export const insightsSearchSchema = insightsSearchFields.superRefine(checkPeriod);

export const insightsQuerySchema = insightsRequestFields.extend({ asOf: isoDateSchema }).superRefine(checkPeriod);

export type InsightsSearch = z.output<typeof insightsSearchSchema>;
export type InsightsQuery = z.output<typeof insightsQuerySchema>;

const rowSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(insightRowKinds),
  amount: money,
  inflow: money.nullable(),
});

const groupRowSchema = rowSchema.extend({ categories: z.array(rowSchema) });

const flowSchema = z.object({
  income: money,
  spending: money,
});

const timelineMonthSchema = z.object({
  month: z.string().refine(isMonthKey),
  actual: flowSchema.nullable(),
  forecast: flowSchema.nullable(),
});

const pointSchema = z.object({
  date: isoDateSchema,
  amount: money,
});

const timelineSchema = z.object({
  categoryId: z.uuid().nullable(),
  months: z.array(timelineMonthSchema),
  balances: z.array(pointSchema),
  forecast: z
    .object({
      dates: z.array(isoDateSchema),
      known: z.array(money),
      estimated: z.array(money),
    })
    .nullable(),
});

export const insightsSchema = z.object({
  asOf: isoDateSchema,
  window: z.enum(insightWindows),
  from: isoDateSchema,
  to: isoDateSchema,
  range: z.object({ from: isoDateSchema, to: isoDateSchema }),
  income: money,
  spending: money,
  savings: money,
  savingsRateMilliPct: z.number().int().nullable(),
  groups: z.array(groupRowSchema),
  timeline: timelineSchema,
});

export type InsightRow = z.infer<typeof rowSchema>;
export type InsightGroupRow = z.infer<typeof groupRowSchema>;
export type InsightFlow = z.infer<typeof flowSchema>;
export type InsightTimelineMonth = z.infer<typeof timelineMonthSchema>;
export type InsightTimeline = z.infer<typeof timelineSchema>;
export type Insights = z.infer<typeof insightsSchema>;
