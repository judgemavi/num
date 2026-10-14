import { z } from "zod";
import { isoDateSchema } from "./date";
import { archivedQuery, listQuerySchema, optionalQuery, pagedResponseSchema, queryId, queryText } from "./list";
import { amountModes, businessDayShifts, planFrequencies, planKinds } from "./recurring-calc";
import { proposalSubject, type PlanProposal } from "./recurring-detect";
import { isUtcTimestamp } from "./time";
import { amountSchema } from "./money";

const toleranceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const monthDaySchema = z
  .number()
  .int()
  .refine((day) => day === -1 || (day >= 1 && day <= 31));

const planFields = {
  name: z.string().trim().min(1),
  kind: z.enum(planKinds),
  accountId: z.uuid(),
  expectedAmount: amountSchema,
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
};

const createFields = z.object({
  ...planFields,
  active: z.boolean().default(true),
  fundsBuckets: z.boolean().default(false),
});

/** The fields of a stored plan. `active` and `fundsBuckets` have no default here. */
const updateFields = z.object({
  ...planFields,
  active: z.boolean().optional(),
  fundsBuckets: z.boolean().optional(),
});

function planRules(value: z.infer<typeof updateFields>, context: z.RefinementCtx) {
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
}

export const planCreateSchema = createFields.superRefine(planRules);
/** A PATCH body: only the fields that change. The API checks the fields together on the stored plan with the patch. */
export const planUpdateSchema = updateFields.partial();

export const planSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(planKinds),
  accountId: z.uuid(),
  expectedAmount: amountSchema,
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
  q: queryText,
  kind: optionalQuery(z.enum(planKinds)),
  accountId: queryId,
  ...archivedQuery,
});

export const planListSchema = pagedResponseSchema(planSchema);

export const occurrenceStatuses = ["open", "linked", "skipped", "missed", "changed"] as const;

export const occurrenceSchema = z.object({
  dueDate: isoDateSchema,
  nominalDate: isoDateSchema,
  status: z.enum(occurrenceStatuses),
  transactionId: z.uuid().nullable(),
  actualAmount: amountSchema.nullable(),
  reason: z.string().nullable(),
});

export const occurrenceListSchema = z.object({
  forecastAmount: amountSchema,
  safeAmount: amountSchema,
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
  expectedAmount: amountSchema,
  actualAmount: amountSchema,
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
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  freq: z.enum(planFrequencies),
  interval: z.number().int(),
  startDate: isoDateSchema,
  monthDay: monthDaySchema.nullable(),
  expectedAmount: amountSchema,
  tolerance: toleranceSchema,
  amountMode: z.enum(amountModes),
  transactionIds: z.array(z.uuid()),
});

export function planProposalKey(
  item: Pick<PlanProposal, "accountId" | "merchantId" | "categoryId" | "expectedAmount" | "startDate" | "freq" | "interval">,
): string {
  return `plan_proposal:${item.accountId}:${proposalSubject(item)}:${item.startDate}:${item.freq}:${item.interval}`;
}

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
