import { amountText, planCreateSchema, parseAmount, type Plan, type PlanKind, type PlanProposal } from "@num/shared";
import { amountForForm, amountFromForm } from "@/recurring/format";

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

/** The request body of the Recurring form, or the text of the first error. */
export function planBody(currency: string, value: PlanValues) {
  if (!value.accountId) {
    return { body: null, error: "Choose an account." };
  }
  let expectedAmount = 0;
  let tolerance = 0;
  try {
    expectedAmount = amountFromForm(value.kind, parseAmount(currency, value.amount.trim()));
    tolerance = Math.abs(parseAmount(currency, value.tolerance.trim() || "0"));
  } catch {
    return { body: null, error: "Enter the amount as a number." };
  }
  const every = Number(value.interval);
  if (!Number.isInteger(every) || every < 1) {
    return { body: null, error: "Enter how often this repeats as a whole number." };
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
  return parsed.success ? { body: parsed.data, error: null } : { body: null, error: "Check the details and try again." };
}
