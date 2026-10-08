import { fromMinorUnits, Temporal, type Plan, type PlanFrequency, type PlanKind } from "@num/shared";

const kindLabels: Record<PlanKind, string> = {
  income: "Income",
  bill: "Bill",
  transfer: "Transfer",
};

export function kindLabel(kind: PlanKind): string {
  return kindLabels[kind];
}

export function scheduleLabel(plan: Pick<Plan, "freq" | "interval">): string {
  if (plan.freq === "weekly" && plan.interval === 1) {
    return "Every week";
  }
  if (plan.freq === "weekly" && plan.interval === 2) {
    return "Every two weeks";
  }
  if (plan.freq === "monthly" && plan.interval === 1) {
    return "Every month";
  }
  if (plan.freq === "yearly" && plan.interval === 1) {
    return "Every year";
  }
  const unit: Record<PlanFrequency, string> = { weekly: "weeks", monthly: "months", yearly: "years" };
  return `Every ${plan.interval} ${unit[plan.freq]}`;
}

export function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { dateStyle: "medium" });
}

export function amountForForm(currency: string, kind: PlanKind, minor: number): string {
  const shown = kind === "transfer" ? minor : Math.abs(minor);
  return fromMinorUnits(currency, shown);
}

export function amountFromForm(kind: PlanKind, minor: number): number {
  if (kind === "income") {
    return Math.abs(minor);
  }
  if (kind === "bill") {
    return -Math.abs(minor);
  }
  return minor;
}

export function planError(code: string): string {
  switch (code) {
    case "plan_not_found":
      return "That plan is not in the book.";
    case "plan_archived":
      return "Restore the plan before you change it.";
    case "plan_not_archived":
      return "This plan is already active.";
    case "plan_fields_invalid":
      return "Check the plan details and try again.";
    case "account_not_found":
    case "account_archived":
      return "Choose an account that is still in use.";
    case "category_not_found":
    case "category_archived":
      return "Choose a category that is still in use.";
    case "merchant_not_found":
    case "merchant_archived":
      return "Choose a merchant that is still in use.";
    case "occurrence_not_found":
      return "That date is not on this plan.";
    case "occurrence_taken":
      return "This occurrence already has a link or a skip.";
    case "transaction_already_linked":
      return "That transaction is already linked to a plan.";
    case "transaction_not_found":
      return "That transaction is not in the book.";
    case "link_not_found":
      return "This occurrence has no linked transaction.";
    case "skip_not_found":
      return "This occurrence is not skipped.";
    default:
      return "The change did not save. Try again.";
  }
}

export { localAsOf } from "@/as-of";
