import { z } from "zod";
import { isoDateSchema } from "./date";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { amountModes, businessDayShifts, planFrequencies, planKinds } from "./recurring-calc";
import { type PlanProposal } from "./recurring-detect";
import { isUtcTimestamp } from "./time";
import { centsSchema } from "./money";

const toleranceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const monthDaySchema = z
  .number()
  .int()
  .refine((day) => day === -1 || (day >= 1 && day <= 31));

function blankQuery(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalQueryText = z.preprocess(blankQuery, z.string().trim().min(1).optional());
const optionalQueryId = z.preprocess(blankQuery, z.uuid().optional());

const planInputSchema = z
  .object({
    name: z.string().trim().min(1),
    kind: z.enum(planKinds),
    accountId: z.uuid(),
    expectedAmount: centsSchema,
    tolerance: toleranceSchema,
    amountMode: z.enum(amountModes),
    categoryId: z.uuid().nullable().optional(),
    transferAccountId: z.uuid().nullable().optional(),
    merchantId: z.uuid().nullable().optional(),
    startDate: isoDateSchema,
    freq: z.enum(planFrequencies),
    interval: z.number().int().min(1),
    monthDay: monthDaySchema.nullable().optional(),
    businessDayShift: z.enum(businessDayShifts),
    endDate: isoDateSchema.nullable().optional(),
    active: z.boolean().default(true),
    fundsBuckets: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.kind === "transfer") {
      if (!value.transferAccountId || value.transferAccountId === value.accountId) {
        context.addIssue({ code: "custom", path: ["transferAccountId"] });
      }
      if (value.categoryId) {
        context.addIssue({ code: "custom", path: ["categoryId"] });
      }
    } else if (value.transferAccountId) {
      context.addIssue({ code: "custom", path: ["transferAccountId"] });
    }
    if (value.freq === "weekly" && value.monthDay != null) {
      context.addIssue({ code: "custom", path: ["monthDay"] });
    }
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", path: ["endDate"] });
    }
    if (value.fundsBuckets && value.kind !== "income") {
      context.addIssue({ code: "custom", path: ["fundsBuckets"] });
    }
  });

export const planCreateSchema = planInputSchema;
export const planUpdateSchema = planInputSchema;

export const planSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(planKinds),
  accountId: z.uuid(),
  expectedAmount: centsSchema,
  tolerance: toleranceSchema,
  amountMode: z.enum(amountModes),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  merchantId: z.uuid().nullable(),
  startDate: isoDateSchema,
  freq: z.enum(planFrequencies),
  interval: z.number().int(),
  monthDay: monthDaySchema.nullable(),
  businessDayShift: z.enum(businessDayShifts),
  endDate: isoDateSchema.nullable(),
  active: z.boolean(),
  fundsBuckets: z.boolean(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const planSortColumns = ["name", "startDate"] as const;

export const planListQuerySchema = listQuerySchema(planSortColumns).extend({
  q: optionalQueryText,
  kind: z.preprocess(blankQuery, z.enum(planKinds).optional()),
  accountId: optionalQueryId,
  archived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export const planListSchema = pagedResponseSchema(planSchema);

export const occurrenceStatuses = ["open", "linked", "skipped", "missed", "changed"] as const;

export const occurrenceSchema = z.object({
  dueDate: isoDateSchema,
  nominalDate: isoDateSchema,
  status: z.enum(occurrenceStatuses),
  transactionId: z.uuid().nullable(),
  actualAmount: centsSchema.nullable(),
  reason: z.string().nullable(),
});

export const occurrenceListSchema = z.object({
  forecastAmount: centsSchema,
  safeAmount: centsSchema,
  items: z.array(occurrenceSchema),
});

export const occurrenceLinkSchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  dueDate: isoDateSchema,
  transactionId: z.uuid().nullable(),
  skipped: z.boolean(),
  reason: z.string().nullable(),
});

export const occurrenceLinkBodySchema = z.object({
  transactionId: z.uuid(),
});

export const occurrenceSkipBodySchema = z.object({
  reason: z.string().trim().min(1),
});

export const changedOccurrenceSchema = z.object({
  planId: z.uuid(),
  dueDate: isoDateSchema,
  transactionId: z.uuid(),
  expectedAmount: centsSchema,
  actualAmount: centsSchema,
});

export const missedOccurrenceSchema = z.object({
  planId: z.uuid(),
  dueDate: isoDateSchema,
});

export const ambiguousLinkSchema = z.object({
  planId: z.uuid(),
  dueDate: isoDateSchema,
  transactionIds: z.array(z.uuid()),
});

export const planProposalSchema = z.object({
  accountId: z.uuid(),
  merchantId: z.uuid(),
  freq: z.enum(planFrequencies),
  interval: z.number().int(),
  startDate: isoDateSchema,
  monthDay: monthDaySchema.nullable(),
  expectedAmount: centsSchema,
  tolerance: toleranceSchema,
  amountMode: z.enum(amountModes),
  transactionIds: z.array(z.uuid()),
});

export const recurringSignalsSchema = z.object({
  changed: z.array(changedOccurrenceSchema),
  missed: z.array(missedOccurrenceSchema),
  ambiguous: z.array(ambiguousLinkSchema),
  proposals: z.array(planProposalSchema),
});

export const autoLinkResultSchema = z.object({
  linked: z.number().int(),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanCreate = z.infer<typeof planCreateSchema>;
export type PlanUpdate = z.infer<typeof planUpdateSchema>;
export type PlanListQuery = z.output<typeof planListQuerySchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type OccurrenceLink = z.infer<typeof occurrenceLinkSchema>;
export type OccurrenceStatus = (typeof occurrenceStatuses)[number];
export type OccurrenceList = z.infer<typeof occurrenceListSchema>;
export type ChangedOccurrence = z.infer<typeof changedOccurrenceSchema>;
export type MissedOccurrence = z.infer<typeof missedOccurrenceSchema>;
export type RecurringSignals = z.infer<typeof recurringSignalsSchema>;
export type { PlanProposal };
