import { z } from "zod";
import { asOfQuerySchema, isoDateSchema } from "./date";
import { amountModes, planFrequencies } from "./recurring-calc";
import { suggestionSchema } from "./suggest";
import { unreadableReasons } from "./statement";
import { isUtcTimestamp } from "./time";
import { centsSchema as cents } from "./money";

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
  "bucket_overspent",
  "import_unreadable",
  "paycheck_funding",
] as const;

export type InboxKind = (typeof inboxKinds)[number];

export const inboxDecisionCodes = [
  "not_transfer",
  "keep_plan_amount",
  "not_recurring",
  "keep_unassigned",
  "not_a_transaction",
] as const;

export type InboxDecisionCode = (typeof inboxDecisionCodes)[number];

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
    accountId: z.uuid(),
    transactionId: z.uuid(),
    lineId: z.uuid(),
    amount: cents,
    payee: z.string(),
    payeeRaw: z.string(),
    suggestion: suggestionSchema,
    next: suggestionSchema.nullable(),
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
    raw: z.string(),
    reason: z.enum(unreadableReasons),
  }),
  z.object({
    kind: z.literal("paycheck_funding"),
    itemKey,
    date: isoDateSchema,
    incomeTransactionId: z.uuid(),
    dueDate: isoDateSchema,
    amount: cents,
    payee: z.string(),
  }),
]);

export const inboxImportSchema = z.object({
  accountId: z.uuid(),
  lastImportAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const inboxQuerySchema = asOfQuerySchema;

export const inboxSchema = z.object({
  asOf: isoDateSchema,
  count: z.number().int().nonnegative(),
  staleImportDays: z.number().int().nonnegative(),
  items: z.array(inboxItemSchema),
  imports: z.array(inboxImportSchema),
});

export const inboxDecisionSchema = z.object({
  itemKey,
  decision: z.enum(inboxDecisionCodes),
  reason: z.string().nullable(),
  decidedAt: z.string().refine(isUtcTimestamp),
});

export const inboxDecisionListSchema = z.object({
  items: z.array(inboxDecisionSchema),
});

export const inboxDecisionCreateSchema = z.object({
  itemKey,
  decision: z.enum(inboxDecisionCodes),
});

export const inboxDecisionUndoSchema = z.object({
  itemKey,
});

export const inboxUnreadableAcceptSchema = z.object({
  itemKey,
});

export const inboxKeysSchema = z.object({
  itemKeys: z.array(itemKey).min(1).max(500),
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

export const groupSkipReasons = ["split", "reconciled", "other_account", "categorized"] as const;

export type GroupSkipReason = (typeof groupSkipReasons)[number];

export const skippedRowSchema = z.object({
  id: z.uuid(),
  reason: z.enum(groupSkipReasons),
});

export const inboxGroupApplySchema = z
  .object({
    accountId: z.uuid(),
    transactionIds: z.array(z.uuid()).min(1).max(500),
    excludedIds: z.array(z.uuid()).max(500),
    categoryId: z.uuid().nullable(),
    transferAccountId: z.uuid().nullable(),
    merchantId: z.uuid().nullable(),
  })
  .refine((value) => (value.categoryId === null) !== (value.transferAccountId === null));

export const inboxGroupApplyResultSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped: z.array(skippedRowSchema),
});

export const payeeCountQuerySchema = z.object({
  payee: z.string().trim().min(1).max(200),
  accountId: z.uuid(),
  except: z.string().optional(),
});

export const payeeCountSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;
export type Inbox = z.infer<typeof inboxSchema>;
export type InboxDecision = z.infer<typeof inboxDecisionSchema>;
export type ImportReviewResolve = z.infer<typeof importReviewResolveSchema>;
export type InboxGroupApply = z.infer<typeof inboxGroupApplySchema>;
export type GroupSkip = z.infer<typeof skippedRowSchema>;
