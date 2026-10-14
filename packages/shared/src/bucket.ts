import { z } from "zod";
import { isoDateSchema } from "./date";
import { archivedQuery, listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";
import { nonNegativeAmountSchema as money, positiveAmountSchema } from "./money";

export const bucketKinds = ["spending", "sinking", "goal"] as const;

export type BucketKind = (typeof bucketKinds)[number];

export const sinkingRepeats = ["none", "yearly"] as const;

export type SinkingRepeat = (typeof sinkingRepeats)[number];

export const bucketEventKinds = ["fund", "move", "release"] as const;

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

const nameSchema = z.string().trim().min(1);
const bucketFields = {
  name: nameSchema,
  kind: z.enum(bucketKinds),
  priority: z.number().int().min(0).max(1_000_000),
  essential: z.boolean(),
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
};

export function kindFieldsValid(value: {
  kind: BucketKind;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  repeat: SinkingRepeat | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
}): boolean {
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

export const bucketWriteSchema = z.object(bucketFields).refine(kindFieldsValid, { path: ["kind"] });

// A new bucket can leave out startDate. Then the bucket starts on asOf (decision 0029).
export const bucketCreateSchema = z
  .object({ ...bucketFields, startDate: isoDateSchema.optional() })
  .refine(kindFieldsValid, { path: ["kind"] });

export const bucketSchema = z.object({
  id: z.uuid(),
  ...bucketFields,
  name: z.string(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
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
  fundingRunId: z.uuid().nullable(),
  undoneAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const bucketEventListSchema = z.object({
  items: z.array(bucketEventSchema),
});

export const bucketEventCreateSchema = z
  .object({
    kind: z.enum(bucketEventKinds),
    amount: positiveAmountSchema,
    date: isoDateSchema,
    note: noteSchema,
    otherBucketId: z.uuid().nullable().optional(),
  })
  .refine((value) => (value.kind === "move") === (value.otherBucketId != null), { path: ["otherBucketId"] });

export const bucketCoverSchema = z.object({
  fromBucketId: z.uuid(),
  date: isoDateSchema,
});

export function nextBucketColor(count: number): BucketColor {
  const index = ((count % bucketColors.length) + bucketColors.length) % bucketColors.length;
  return bucketColors[index] ?? "sky";
}

export type Bucket = z.infer<typeof bucketSchema>;
export type BucketWrite = z.infer<typeof bucketWriteSchema>;
export type BucketCreate = z.infer<typeof bucketCreateSchema>;
export type BucketListQuery = z.output<typeof bucketListQuerySchema>;
export type BucketEvent = z.infer<typeof bucketEventSchema>;
export type BucketEventCreate = z.infer<typeof bucketEventCreateSchema>;
export type BucketCover = z.infer<typeof bucketCoverSchema>;
export type OverspentBucket = z.infer<typeof overspentBucketSchema>;
