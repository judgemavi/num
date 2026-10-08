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

export function mortgageError(code: string): string {
  switch (code) {
    case "not_mortgage":
      return "These terms are only for a mortgage.";
    case "mortgage_terms_invalid":
      return "The first payment is on or after the principal date. The term ends on or after the first payment.";
    case "payment_account_invalid":
      return "Choose an open account to pay from.";
    case "interest_category_invalid":
      return "Choose an expense category for the interest.";
    case "property_account_invalid":
      return "Choose a property account, or leave the property empty.";
    case "account_archived":
      return "This mortgage is archived.";
    case "account_not_found":
      return "That account is not in the book.";
    default:
      return "The mortgage terms did not save. Try again.";
  }
}
