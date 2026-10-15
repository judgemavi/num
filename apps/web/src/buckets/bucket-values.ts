import { bucketWriteSchema, amountText, emergencyDefaults, isSavings, parseAmount, type Bucket, type BucketColor } from "@num/shared";
import { localAsOf } from "@/as-of";
import { editPatch, keptAmount } from "@/forms/form-values";
import { decimalsError } from "@/money";

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
    /** A goal saves by a date, or a set amount each month. */
    goalMode: bucket?.fixedAmount !== null && bucket?.fixedAmount !== undefined ? "month" : "date",
    months: String(bucket?.months ?? emergencyDefaults.months),
    priority: String(bucket?.priority ?? lastPriority + 1),
    /** The value for a spending bucket, essential by default. The body sends null for the other kinds. */
    essential: bucket?.essential ?? true,
    /** The value for a savings kind. The body sends null for the other kinds. */
    canRecede: bucket?.canRecede ?? false,
  };
}

type BucketValues = ReturnType<typeof bucketValues>;

type BucketAmount = "refillTo" | "amount" | "target" | "fixedAmount";

function bucketFields(currency: string, value: BucketValues, stored: Bucket | null) {
  const read = (field: BucketAmount) => {
    const minor = stored?.[field] ?? null;
    const start = minor === null ? null : { text: money(minor), amount: minor };
    return keptAmount(value[field], start, (text) => parseAmount(currency, text.trim()));
  };
  return {
    name: value.name.trim(),
    kind: value.kind,
    priority: Number(value.priority),
    essential: value.kind === "spending" ? value.essential : null,
    color: value.color,
    icon: value.icon,
    categoryIds: value.kind === "emergency" ? [] : value.categoryIds,
    startDate: value.startDate,
    refillTo: value.kind === "spending" ? read("refillTo") : null,
    amount: value.kind === "sinking" ? read("amount") : null,
    dueDate: value.kind === "sinking" ? value.dueDate : null,
    repeat: value.kind === "sinking" ? value.repeat : null,
    target: value.kind === "goal" ? read("target") : null,
    targetDate: value.kind === "goal" && value.goalMode === "date" ? value.targetDate : null,
    fixedAmount: value.kind === "goal" && value.goalMode === "month" ? read("fixedAmount") : null,
    months: value.kind === "emergency" ? Number(value.months) : null,
    canRecede: isSavings(value.kind) ? value.canRecede : null,
    schedule: null,
  };
}

/**
 * The request body of the Bucket form, or the text of the first error. For a saved bucket, `patch` has only the fields
 * that changed. It is null when nothing changed.
 */
export function bucketBody(currency: string, value: BucketValues, stored: Bucket | null) {
  let body;
  try {
    body = bucketFields(currency, value, stored);
  } catch {
    const typed = [value.refillTo, value.amount, value.target, value.fixedAmount];
    return { body: null, patch: null, error: typed.map((text) => decimalsError(currency, text)).find((text) => text !== null) ?? "Enter amounts as numbers." };
  }
  const parsed = bucketWriteSchema.safeParse(body);
  if (!parsed.success) {
    return { body: null, patch: null, error: "Check the bucket fields." };
  }
  const start = stored ? bucketFields(currency, bucketValues(stored, stored.color, 0), stored) : null;
  return { body: parsed.data, patch: start ? editPatch(body, start) : null, error: null };
}
