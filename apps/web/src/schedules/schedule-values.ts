import { amountText, bucketWriteSchema, parseAmount, type Bucket, type IdentityColor, type PlanProposal } from "@num/shared";
import { localAsOf } from "@/as-of";
import { editPatch, keptAmount } from "@/forms/form-values";
import { decimalsError } from "@/money";
import { amountForForm, amountFromForm } from "@/schedules/format";

type ScheduleKind = "commitment" | "income";

/** A schedule that Num proposes. The person checks it in the form before it is saved. */
export type ScheduleSeed = PlanProposal & { name: string };

function monthValue(day: number | null | undefined) {
  if (day === -1) {
    return "last";
  }
  if (day == null) {
    return "same";
  }
  return String(day);
}

/** The start values of the Commitment and Income forms: a saved bucket, a proposal, or a new bucket. */
export function scheduleValues(kind: ScheduleKind, draft: Bucket | ScheduleSeed | "new", nextColor: IdentityColor) {
  const saved = draft !== "new" && "id" in draft ? draft : null;
  const seed = draft !== "new" && !("id" in draft) ? draft : null;
  const schedule = saved?.schedule ?? null;
  const source = schedule ?? seed;
  return {
    name: saved?.name ?? seed?.name ?? "",
    color: saved?.color ?? nextColor,
    icon: saved?.icon ?? (kind === "income" ? ("briefcase" as const) : ("wallet" as const)),
    priority: String(saved?.priority ?? 0),
    essential: saved?.essential ?? kind === "commitment",
    bucketStart: saved?.startDate ?? localAsOf(),
    accountId: source?.accountId ?? null,
    transferAccountId: source?.transferAccountId ?? null,
    categoryId: source?.categoryId ?? null,
    merchantId: source?.merchantId ?? null,
    amount: source ? amountForForm(source.expectedAmount) : "",
    tolerance: source ? amountText(source.tolerance) : "0",
    amountMode: source?.amountMode ?? "fixed",
    startDate: source?.startDate ?? "",
    freq: source?.freq ?? "monthly",
    interval: String(source?.interval ?? 1),
    /** "same", "last" or a day of the month. */
    monthDay: monthValue(source?.monthDay),
    shift: schedule?.businessDayShift ?? "none",
    endDate: schedule?.endDate ?? "",
  };
}

type ScheduleFormValues = ReturnType<typeof scheduleValues>;

function scheduleFields(currency: string, kind: ScheduleKind, value: ScheduleFormValues, stored: Bucket | null) {
  if (!value.accountId) {
    throw new Error("Choose an account.");
  }
  const every = Number(value.interval);
  if (!Number.isInteger(every) || every < 1) {
    throw new Error("Enter how often this repeats as a whole number.");
  }
  let expectedAmount = 0;
  let tolerance = 0;
  try {
    const schedule = stored?.schedule ?? null;
    const amountStart = schedule ? { text: amountForForm(schedule.expectedAmount), amount: Math.abs(schedule.expectedAmount) } : null;
    expectedAmount = amountFromForm(kind, keptAmount(value.amount, amountStart, (text) => Math.abs(parseAmount(currency, text.trim()))));
    const toleranceStart = schedule ? { text: amountText(schedule.tolerance), amount: schedule.tolerance } : null;
    tolerance = Math.abs(keptAmount(value.tolerance, toleranceStart, (text) => parseAmount(currency, text.trim() || "0")));
  } catch {
    throw new Error(decimalsError(currency, value.amount) ?? decimalsError(currency, value.tolerance) ?? "Enter the amount as a number.");
  }
  const transfer = kind === "commitment" ? value.transferAccountId : null;
  return {
    name: value.name.trim(),
    kind,
    priority: Number(value.priority),
    essential: kind === "commitment" ? value.essential : null,
    color: value.color,
    icon: value.icon,
    categoryIds: [],
    startDate: value.bucketStart,
    refillTo: null,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    canRecede: null,
    schedule: {
      accountId: value.accountId,
      expectedAmount,
      tolerance,
      amountMode: value.amountMode,
      categoryId: transfer ? null : value.categoryId,
      transferAccountId: transfer,
      merchantId: value.merchantId,
      startDate: value.startDate,
      freq: value.freq,
      interval: every,
      monthDay: value.freq === "weekly" || value.monthDay === "same" ? null : value.monthDay === "last" ? -1 : Number(value.monthDay),
      businessDayShift: value.shift,
      endDate: value.endDate.trim().length > 0 ? value.endDate : null,
    },
  };
}

/**
 * The request body of the Commitment and Income forms, or the text of the first error. For a saved bucket, `patch` has
 * only the fields that changed. It is null when nothing changed.
 */
export function scheduleBody(currency: string, kind: ScheduleKind, value: ScheduleFormValues, stored: Bucket | null) {
  let fields;
  try {
    fields = scheduleFields(currency, kind, value, stored);
  } catch (caught) {
    return { body: null, patch: null, error: caught instanceof Error ? caught.message : "Check the details and try again." };
  }
  const parsed = bucketWriteSchema.safeParse(fields);
  if (!parsed.success) {
    return { body: null, patch: null, error: "Check the details and try again." };
  }
  if (!stored) {
    return { body: parsed.data, patch: null, error: null };
  }
  let start;
  try {
    start = scheduleFields(currency, kind, scheduleValues(kind, stored, stored.color), stored);
  } catch {
    // A saved bucket that the form cannot read: each field is a change.
    return { body: parsed.data, patch: fields, error: null };
  }
  return { body: parsed.data, patch: editPatch(fields, start), error: null };
}
