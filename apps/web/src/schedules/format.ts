import { amountText, type PlanFrequency, type Schedule } from "@num/shared";

export function scheduleLabel(schedule: Pick<Schedule, "freq" | "interval">): string {
  if (schedule.freq === "weekly" && schedule.interval === 1) {
    return "Every week";
  }
  if (schedule.freq === "weekly" && schedule.interval === 2) {
    return "Every two weeks";
  }
  if (schedule.freq === "monthly" && schedule.interval === 1) {
    return "Every month";
  }
  if (schedule.freq === "yearly" && schedule.interval === 1) {
    return "Every year";
  }
  const unit: Record<PlanFrequency, string> = { weekly: "weeks", monthly: "months", yearly: "years" };
  return `Every ${schedule.interval} ${unit[schedule.freq]}`;
}

/** The form shows an amount with no sign. */
export function amountForForm(milli: number): string {
  return amountText(Math.abs(milli));
}

/** An income is money in. A commitment is money out. */
export function amountFromForm(kind: "commitment" | "income", milli: number): number {
  return kind === "income" ? Math.abs(milli) : -Math.abs(milli);
}
