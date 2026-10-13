import type { Compounding, PaymentFrequency } from "@num/shared";

export const compoundingLabels: Record<Compounding, string> = {
  monthly: "Monthly",
  semiannual: "Twice a year",
};

export const frequencyLabels: Record<PaymentFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Every month",
};
