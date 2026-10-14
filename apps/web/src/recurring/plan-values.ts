import { amountText, planCreateSchema, parseAmount, type Plan, type PlanKind, type PlanProposal } from "@num/shared";
import { editPatch, keptAmount } from "@/forms/form-values";
import { amountForForm, amountFromForm } from "@/recurring/format";
import { decimalsError } from "@/money";

/** A recurring item that Num proposes. The person checks it in the form before it is saved. */
export type PlanSeed = PlanProposal & { name: string; kind: PlanKind };

function isPlan(draft: Plan | PlanSeed | "new"): draft is Plan {
  return draft !== "new" && "id" in draft;
}

function monthValue(day: number | null | undefined) {
  if (day === -1) {
    return "last";
  }
  if (day == null) {
    return "same";
  }
  return String(day);
}

/** The start values of the Recurring form: a saved item, a proposal, or a new item of `initialKind`. */
export function planValues(draft: Plan | PlanSeed | "new", initialKind: PlanKind) {
  const current = isPlan(draft) ? draft : null;
  const seed = draft === "new" ? null : draft;
  const kind = seed?.kind ?? initialKind;
  return {
    name: seed?.name ?? "",
    kind,
    accountId: seed?.accountId ?? null,
    transferAccountId: current?.transferAccountId ?? null,
    categoryId: current?.categoryId ?? null,
    merchantId: seed?.merchantId ?? null,
    amount: seed ? amountForForm(kind, seed.expectedAmount) : "",
    tolerance: seed ? amountText(seed.tolerance) : "0",
    amountMode: seed?.amountMode ?? "fixed",
    startDate: seed?.startDate ?? "",
    freq: seed?.freq ?? "monthly",
    interval: String(seed?.interval ?? 1),
    /** "same", "last" or a day of the month. */
    monthDay: monthValue(seed?.monthDay),
    shift: current?.businessDayShift ?? "none",
    endDate: current?.endDate ?? "",
    active: current?.active ?? true,
    fundsBuckets: current?.fundsBuckets ?? false,
  };
}

type PlanValues = ReturnType<typeof planValues>;

function planFields(currency: string, value: PlanValues, stored: Plan | null) {
  if (!value.accountId) {
    throw new Error("Choose an account.");
  }
  let expectedAmount = 0;
  let tolerance = 0;
  try {
    const amountStart = stored ? { text: amountForForm(stored.kind, stored.expectedAmount), amount: stored.expectedAmount } : null;
    expectedAmount = amountFromForm(value.kind, keptAmount(value.amount, amountStart, (text) => parseAmount(currency, text.trim())));
    const toleranceStart = stored ? { text: amountText(stored.tolerance), amount: stored.tolerance } : null;
    tolerance = Math.abs(keptAmount(value.tolerance, toleranceStart, (text) => parseAmount(currency, text.trim() || "0")));
  } catch {
    throw new Error(decimalsError(currency, value.amount) ?? decimalsError(currency, value.tolerance) ?? "Enter the amount as a number.");
  }
  const every = Number(value.interval);
  if (!Number.isInteger(every) || every < 1) {
    throw new Error("Enter how often this repeats as a whole number.");
  }
  const parsed = planCreateSchema.safeParse({
    name: value.name.trim(),
    kind: value.kind,
    accountId: value.accountId,
    expectedAmount,
    tolerance,
    amountMode: value.amountMode,
    categoryId: value.kind === "transfer" ? null : value.categoryId,
    transferAccountId: value.kind === "transfer" ? value.transferAccountId : null,
    merchantId: value.merchantId,
    startDate: value.startDate,
    freq: value.freq,
    interval: every,
    monthDay: value.freq === "weekly" ? null : value.monthDay === "last" ? -1 : value.monthDay === "same" ? null : Number(value.monthDay),
    businessDayShift: value.shift,
    endDate: value.endDate.trim().length > 0 ? value.endDate : null,
    active: value.active,
    fundsBuckets: value.kind === "income" ? value.fundsBuckets : false,
  });
  if (!parsed.success) {
    throw new Error("Check the details and try again.");
  }
  return parsed.data;
}

/**
 * The request body of the Recurring form, or the text of the first error. For a saved plan, `patch` has only the
 * fields that changed (decision 0040). It is null when nothing changed.
 */
export function planBody(currency: string, value: PlanValues, stored: Plan | null) {
  let body;
  try {
    body = planFields(currency, value, stored);
  } catch (caught) {
    return { body: null, patch: null, error: caught instanceof Error ? caught.message : "Check the details and try again." };
  }
  if (!stored) {
    return { body, patch: null, error: null };
  }
  let start;
  try {
    start = planFields(currency, planValues(stored, stored.kind), stored);
  } catch {
    // A saved plan that the form cannot read: each field is a change.
    return { body, patch: body, error: null };
  }
  return { body, patch: editPatch(body, start), error: null };
}
