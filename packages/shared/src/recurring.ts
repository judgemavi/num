import { z } from "zod";
import { isoDateSchema } from "./date";
import { amountModes, planFrequencies } from "./recurring-calc";
import { proposalSubject, type PlanProposal } from "./recurring-detect";
import { amountSchema } from "./money";
import { monthDaySchema, toleranceSchema } from "./schedule";

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

/** The occurrences of all active schedules in the next 30 days, by date (decision 0055). */
export const upcomingListSchema = z.object({
  items: z.array(occurrenceSchema.extend({ bucketId: z.uuid(), accountId: z.uuid(), forecastAmount: amountSchema })),
});

export const occurrenceLinkSchema = z.object({
  id: z.uuid(),
  bucketId: z.uuid(),
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
  bucketId: z.uuid(),
  dueDate: isoDateSchema,
  transactionId: z.uuid(),
  expectedAmount: amountSchema,
  actualAmount: amountSchema,
});

export const missedOccurrenceSchema = z.object({
  bucketId: z.uuid(),
  dueDate: isoDateSchema,
});

export const ambiguousLinkSchema = z.object({
  bucketId: z.uuid(),
  dueDate: isoDateSchema,
  transactionIds: z.array(z.uuid()),
});

export const planProposalSchema = z.object({
  accountId: z.uuid(),
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
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
  item: Pick<PlanProposal, "accountId" | "merchantId" | "categoryId" | "transferAccountId" | "expectedAmount" | "startDate" | "freq" | "interval">,
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

export type Occurrence = z.infer<typeof occurrenceSchema>;
export type OccurrenceLink = z.infer<typeof occurrenceLinkSchema>;
export type OccurrenceStatus = (typeof occurrenceStatuses)[number];
export type OccurrenceList = z.infer<typeof occurrenceListSchema>;
export type UpcomingList = z.infer<typeof upcomingListSchema>;
export type ChangedOccurrence = z.infer<typeof changedOccurrenceSchema>;
export type MissedOccurrence = z.infer<typeof missedOccurrenceSchema>;
export type RecurringSignals = z.infer<typeof recurringSignalsSchema>;
export type { PlanProposal };
