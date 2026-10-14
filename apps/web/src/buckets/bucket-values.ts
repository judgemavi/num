import { bucketWriteSchema, amountText, parseAmount, type Bucket, type BucketColor } from "@num/shared";
import { localAsOf } from "@/as-of";

function money(milli: number | null) {
  return milli === null ? "" : amountText(milli);
}

/**
 * The start values of the Bucket form. A new bucket gets the next colour of the rotation and the priority after the
 * last active bucket.
 */
export function bucketValues(bucket: Bucket | null, nextColor: BucketColor, lastPriority: number) {
  return {
    name: bucket?.name ?? "",
    kind: bucket?.kind ?? "spending",
    color: bucket?.color ?? nextColor,
    icon: bucket?.icon ?? "shopping-cart",
    categoryIds: bucket?.categoryIds ?? [],
    startDate: bucket?.startDate ?? localAsOf(),
    refillTo: money(bucket?.refillTo ?? null),
    amount: money(bucket?.amount ?? null),
    dueDate: bucket?.dueDate ?? "",
    repeat: bucket?.repeat ?? "none",
    target: money(bucket?.target ?? null),
    targetDate: bucket?.targetDate ?? "",
    fixedAmount: money(bucket?.fixedAmount ?? null),
    /** A goal saves by a date, or a set amount from each paycheck. */
    goalMode: bucket?.fixedAmount !== null && bucket?.fixedAmount !== undefined ? "paycheck" : "date",
    priority: String(bucket?.priority ?? lastPriority + 1),
    essential: bucket?.essential ?? false,
  };
}

type BucketValues = ReturnType<typeof bucketValues>;

/** The values of a new bucket. A form part made with `withForm` gets the type of the form values from them. */
export const blankBucket = bucketValues(null, "sky", 0);

/** The request body of the Bucket form, or the text of the first error. */
export function bucketBody(currency: string, value: BucketValues) {
  const read = (text: string) => parseAmount(currency, text.trim());
  let body;
  try {
    body = {
      name: value.name.trim(),
      kind: value.kind,
      priority: Number(value.priority),
      essential: value.essential,
      color: value.color,
      icon: value.icon,
      categoryIds: value.categoryIds,
      startDate: value.startDate,
      refillTo: value.kind === "spending" ? read(value.refillTo) : null,
      amount: value.kind === "sinking" ? read(value.amount) : null,
      dueDate: value.kind === "sinking" ? value.dueDate : null,
      repeat: value.kind === "sinking" ? value.repeat : null,
      target: value.kind === "goal" ? read(value.target) : null,
      targetDate: value.kind === "goal" && value.goalMode === "date" ? value.targetDate : null,
      fixedAmount: value.kind === "goal" && value.goalMode === "paycheck" ? read(value.fixedAmount) : null,
    };
  } catch {
    return { body: null, error: "Enter amounts as numbers." };
  }
  const parsed = bucketWriteSchema.safeParse(body);
  return parsed.success ? { body: parsed.data, error: null } : { body: null, error: "Check the bucket fields." };
}
