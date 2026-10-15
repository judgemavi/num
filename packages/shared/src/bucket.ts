import { z } from "zod";
import { isoDateSchema } from "./date";
import { monthKeySchema } from "./month";
import { archivedQuery, listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";
import { nonNegativeAmountSchema as money, positiveAmountSchema } from "./money";
import { scheduleIssues, scheduleSchema, type Schedule } from "./schedule";

export const bucketKinds = ["commitment", "income", "spending", "sinking", "goal", "emergency"] as const;

export type BucketKind = (typeof bucketKinds)[number];

/** A commitment and an income have a schedule. */
export function hasSchedule(kind: BucketKind): kind is "commitment" | "income" {
  return kind === "commitment" || kind === "income";
}

/** A savings kind. Only a savings bucket can give money back when the pool is short. */
export function isSavings(kind: BucketKind): kind is "sinking" | "goal" | "emergency" {
  return kind === "sinking" || kind === "goal" || kind === "emergency";
}

/** Only a commitment and a spending bucket have `essential`. */
export function hasEssential(kind: BucketKind): kind is "commitment" | "spending" {
  return kind === "commitment" || kind === "spending";
}

/** The default of `canRecede` for a kind. Null for a kind that cannot recede. */
export function recedeDefault(kind: BucketKind): boolean | null {
  return isSavings(kind) ? kind !== "sinking" : null;
}

export const sinkingRepeats = ["none", "yearly"] as const;

export type SinkingRepeat = (typeof sinkingRepeats)[number];

/** The events that the user makes. The fill makes `cover` and `recede`. */
export const manualEventKinds = ["fund", "move", "release"] as const;
export const bucketEventKinds = [...manualEventKinds, "cover", "recede"] as const;

export type BucketEventKind = (typeof bucketEventKinds)[number];

export const bucketColors = ["sky", "mint", "lilac", "butter", "pink", "teal"] as const;

export type BucketColor = (typeof bucketColors)[number];

export const bucketIcons = [
  "shopping-cart",
  "utensils",
  "fuel",
  "smile",
  "package",
  "shirt",
  "paw-print",
  "heart",
  "shield",
  "gift",
  "wrench",
  "house",
  "plane",
  "car",
  "baby",
  "briefcase",
  "piggy-bank",
  "wallet",
  "coffee",
  "bus",
] as const;

export type BucketIcon = (typeof bucketIcons)[number];

/** The order of buckets: the priority, then a commitment first, then the id. */
export function comparePriority(
  left: { priority: number; kind: BucketKind; id: string },
  right: { priority: number; kind: BucketKind; id: string },
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  if ((left.kind === "commitment") !== (right.kind === "commitment")) {
    return left.kind === "commitment" ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

const nameSchema = z.string().trim().min(1);
const monthCount = z.number().int().min(1).max(120);

/** The settings of a new emergency bucket. */
export const emergencyDefaults = { months: 3 } as const;
const bucketFields = {
  name: nameSchema,
  kind: z.enum(bucketKinds),
  priority: z.number().int().min(0).max(1_000_000),
  essential: z.boolean().nullable(),
  color: z.enum(bucketColors),
  icon: z.enum(bucketIcons),
  categoryIds: z.array(z.uuid()),
  startDate: isoDateSchema,
  refillTo: money.nullable(),
  amount: money.nullable(),
  dueDate: isoDateSchema.nullable(),
  repeat: z.enum(sinkingRepeats).nullable(),
  target: money.nullable(),
  targetDate: isoDateSchema.nullable(),
  fixedAmount: money.nullable(),
  months: monthCount.nullable(),
  canRecede: z.boolean().nullable(),
  schedule: scheduleSchema.nullable(),
};

export function kindFieldsValid(value: {
  kind: BucketKind;
  categoryIds: readonly string[];
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  repeat: SinkingRepeat | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
  months: number | null;
  essential: boolean | null;
  canRecede: boolean | null;
  schedule: Schedule | null;
}): boolean {
  if (hasEssential(value.kind) !== (value.essential !== null) || isSavings(value.kind) !== (value.canRecede !== null)) {
    return false;
  }
  if (hasSchedule(value.kind)) {
    return (
      value.schedule !== null &&
      scheduleIssues(value.kind, value.schedule).length === 0 &&
      value.categoryIds.length === 0 &&
      value.months === null &&
      value.refillTo === null &&
      value.amount === null &&
      value.dueDate === null &&
      value.repeat === null &&
      value.target === null &&
      value.targetDate === null &&
      value.fixedAmount === null
    );
  }
  if (value.schedule !== null) {
    return false;
  }
  if (value.kind === "emergency") {
    return (
      value.months !== null &&
      value.categoryIds.length === 0 &&
      value.refillTo === null &&
      value.amount === null &&
      value.dueDate === null &&
      value.repeat === null &&
      value.target === null &&
      value.targetDate === null &&
      value.fixedAmount === null
    );
  }
  if (value.months !== null) {
    return false;
  }
  if (value.kind === "spending") {
    return (
      value.refillTo !== null &&
      value.amount === null &&
      value.dueDate === null &&
      value.repeat === null &&
      value.target === null &&
      value.targetDate === null &&
      value.fixedAmount === null
    );
  }
  if (value.kind === "sinking") {
    return (
      value.amount !== null &&
      value.dueDate !== null &&
      value.repeat !== null &&
      value.refillTo === null &&
      value.target === null &&
      value.targetDate === null &&
      value.fixedAmount === null
    );
  }
  const dated = value.targetDate !== null;
  const fixed = value.fixedAmount !== null;
  return (
    value.target !== null &&
    value.refillTo === null &&
    value.amount === null &&
    value.dueDate === null &&
    value.repeat === null &&
    dated !== fixed
  );
}

const bucketWriteFields = z.object(bucketFields);

function scheduleRules(value: { kind: BucketKind; schedule: Schedule | null }, context: z.RefinementCtx) {
  if (value.schedule && hasSchedule(value.kind)) {
    for (const field of scheduleIssues(value.kind, value.schedule)) {
      context.addIssue({ code: "custom", path: ["schedule", field] });
    }
  }
}

export const bucketWriteSchema = bucketWriteFields.superRefine(scheduleRules).refine(kindFieldsValid, { path: ["kind"] });

/** A PATCH body: only the fields that change. The API checks the kind fields on the stored bucket with the patch. */
export const bucketUpdateSchema = bucketWriteFields.partial();

// A new bucket can leave out startDate. Then the bucket starts on asOf.
export const bucketCreateSchema = z
  .object({ ...bucketFields, startDate: isoDateSchema.optional() })
  .superRefine(scheduleRules)
  .refine(kindFieldsValid, { path: ["kind"] });

export const bucketSchema = z.object({
  id: z.uuid(),
  ...bucketFields,
  name: z.string(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
  /** The fill does not fund a paused bucket: its monthly amount is 0. */
  pausedAt: z.string().refine(isUtcTimestamp).nullable(),
  balance: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
});

export const bucketListQuerySchema = listQuerySchema(["name", "priority", "kind"]).extend(archivedQuery);

export const bucketListSchema = pagedResponseSchema(bucketSchema).extend({
  nextColor: z.enum(bucketColors),
});

export const overspentBucketSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(bucketColors),
  icon: z.enum(bucketIcons),
  balance: z.number().int().negative(),
});

export const emergencyFundSchema = z.object({
  bucketId: z.uuid(),
  archived: z.boolean(),
  balance: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  months: monthCount,
  /** The median monthly essential spending, or the planned figure when fewer than 3 complete months have lines. */
  monthly: money,
  target: money,
  basis: z.enum(["history", "plan"]),
});

/** The next payment of each active bill and the part that its balance does not hold. */
export const billNeedListSchema = z.object({
  items: z.array(
    z.object({
      bucketId: z.uuid(),
      dueDate: isoDateSchema,
      /** The next occurrence, or the sum of the occurrences of its month when the bill is due more than one time a month. */
      amount: money,
      /** The amount minus the balance when the next occurrence is due in the next 30 days. Otherwise 0. */
      short: money,
    }),
  ),
});

export const overspentListSchema = z.object({
  items: z.array(overspentBucketSchema),
});

const noteSchema = z.string().trim().min(1).nullable().optional();

export const bucketEventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(bucketEventKinds),
  bucketId: z.uuid(),
  otherBucketId: z.uuid().nullable(),
  amount: positiveAmountSchema,
  date: isoDateSchema,
  note: z.string().nullable(),
  month: monthKeySchema.nullable(),
  undoneAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const bucketEventListSchema = z.object({
  items: z.array(bucketEventSchema),
});

export const bucketEventCreateSchema = z
  .object({
    kind: z.enum(manualEventKinds),
    amount: positiveAmountSchema,
    date: isoDateSchema,
    note: noteSchema,
    otherBucketId: z.uuid().nullable().optional(),
  })
  .refine((value) => (value.kind === "move") === (value.otherBucketId != null), { path: ["otherBucketId"] });

export const bucketCoverSchema = z.object({
  /** The bucket that gives the money. */
  fromBucketId: z.uuid(),
  date: isoDateSchema,
});

export function nextBucketColor(count: number): BucketColor {
  const index = ((count % bucketColors.length) + bucketColors.length) % bucketColors.length;
  return bucketColors[index] ?? "sky";
}

export type Bucket = z.infer<typeof bucketSchema>;
export type BucketWrite = z.infer<typeof bucketWriteSchema>;
export type BucketUpdate = z.infer<typeof bucketUpdateSchema>;
export type BucketCreate = z.infer<typeof bucketCreateSchema>;
export type BucketListQuery = z.output<typeof bucketListQuerySchema>;
export type BucketEvent = z.infer<typeof bucketEventSchema>;
export type BucketEventCreate = z.infer<typeof bucketEventCreateSchema>;
export type BucketCover = z.infer<typeof bucketCoverSchema>;
export type EmergencyFund = z.infer<typeof emergencyFundSchema>;
export type OverspentBucket = z.infer<typeof overspentBucketSchema>;
