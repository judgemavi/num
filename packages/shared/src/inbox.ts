import { z } from "zod";
import { isoDateSchema } from "./date";
import { amountModes, planFrequencies } from "./recurring-calc";
import { suggestionSchema } from "./suggest";
import { unreadableReasons } from "./statement";
import { isUtcTimestamp } from "./time";

const cents = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const itemKey = z.string().trim().min(1).max(500);
const monthDay = z.number().int().refine((day) => day === -1 || (day >= 1 && day <= 31));

const txnRefSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: cents,
  payeeRaw: z.string(),
});

export const inboxKinds = [
  "import_review",
  "uncategorized",
  "recurring_changed",
  "recurring_missed",
  "recurring_ambiguous",
  "plan_proposal",
  "transfer_pair",
  "promote_rule",
  "bucket_overspent",
  "import_unreadable",
] as const;

export type InboxKind = (typeof inboxKinds)[number];

export const inboxItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("import_review"),
    itemKey,
    date: isoDateSchema,
    importRowId: z.uuid(),
    accountId: z.uuid(),
    amount: cents,
    payeeRaw: z.string(),
    candidates: z.array(txnRefSchema),
  }),
  z.object({
    kind: z.literal("uncategorized"),
    itemKey,
    date: isoDateSchema,
    transactionId: z.uuid(),
    lineId: z.uuid(),
    accountId: z.uuid(),
    amount: cents,
    payeeRaw: z.string(),
    suggestion: suggestionSchema,
  }),
  z.object({
    kind: z.literal("recurring_changed"),
    itemKey,
    date: isoDateSchema,
    planId: z.uuid(),
    dueDate: isoDateSchema,
    transactionId: z.uuid(),
    expectedAmount: cents,
    actualAmount: cents,
  }),
  z.object({
    kind: z.literal("recurring_missed"),
    itemKey,
    date: isoDateSchema,
    planId: z.uuid(),
    dueDate: isoDateSchema,
  }),
  z.object({
    kind: z.literal("recurring_ambiguous"),
    itemKey,
    date: isoDateSchema,
    planId: z.uuid(),
    dueDate: isoDateSchema,
    transactions: z.array(txnRefSchema),
  }),
  z.object({
    kind: z.literal("plan_proposal"),
    itemKey,
    date: isoDateSchema,
    accountId: z.uuid(),
    merchantId: z.uuid(),
    freq: z.enum(planFrequencies),
    interval: z.number().int(),
    startDate: isoDateSchema,
    monthDay: monthDay.nullable(),
    expectedAmount: cents,
    tolerance: cents.nonnegative(),
    amountMode: z.enum(amountModes),
    transactionIds: z.array(z.uuid()),
  }),
  z.object({
    kind: z.literal("transfer_pair"),
    itemKey,
    date: isoDateSchema,
    left: txnRefSchema,
    right: txnRefSchema,
  }),
  z.object({
    kind: z.literal("promote_rule"),
    itemKey,
    date: isoDateSchema.nullable(),
    payee: z.string(),
    merchantId: z.uuid(),
    categoryId: z.uuid(),
    count: z.number().int(),
  }),
  z.object({
    kind: z.literal("bucket_overspent"),
    itemKey,
    date: isoDateSchema,
    bucketId: z.uuid(),
    balance: z.number().int().negative(),
  }),
  z.object({
    kind: z.literal("import_unreadable"),
    itemKey,
    date: isoDateSchema,
    batchId: z.uuid(),
    accountId: z.uuid(),
    line: z.number().int(),
    reason: z.enum(unreadableReasons),
  }),
]);

export const inboxImportSchema = z.object({
  accountId: z.uuid(),
  lastImportAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const inboxSchema = z.object({
  asOf: isoDateSchema,
  count: z.number().int().nonnegative(),
  staleImportDays: z.number().int().nonnegative(),
  items: z.array(inboxItemSchema),
  imports: z.array(inboxImportSchema),
});

export const inboxDismissSchema = z.object({
  itemKey,
  reason: z.string().trim().min(1).max(500),
});

export const inboxRestoreSchema = z.object({
  itemKey,
});

export const importReviewResultSchema = z.object({
  importRowId: z.uuid(),
  transactionId: z.uuid(),
});

export const importReviewResolveSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("match"),
    transactionId: z.uuid(),
  }),
  z.object({
    decision: z.literal("create"),
  }),
]);

export const transferPairAcceptSchema = z.object({
  leftId: z.uuid(),
  rightId: z.uuid(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;
export type Inbox = z.infer<typeof inboxSchema>;
export type InboxDismiss = z.infer<typeof inboxDismissSchema>;
export type ImportReviewResolve = z.infer<typeof importReviewResolveSchema>;
