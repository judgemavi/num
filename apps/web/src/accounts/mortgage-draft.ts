import {
  amountText,
  milliPctToPercent,
  mortgageTermsWriteSchema,
  percentToMilliPct,
  parseAmount,
  type MortgageTerms,
  type MortgageTermsWrite,
} from "@num/shared";
import { decimalsError } from "@/money";

/** The mortgage terms as the form holds them: text for the fields the user types. */
export function draftFromTerms(terms: MortgageTerms | null) {
  return {
    rate: terms ? milliPctToPercent(terms.rateMilliPct) : "",
    compounding: terms?.compounding ?? "semiannual",
    payment: terms ? amountText(terms.paymentAmount) : "",
    frequency: terms?.paymentFrequency ?? "monthly",
    firstPaymentDate: terms?.firstPaymentDate ?? "",
    termEnd: terms?.termEnd ?? "",
    months: terms ? String(terms.amortizationMonthsRemaining) : "",
    paymentAccountId: terms?.paymentAccountId ?? null,
    interestCategoryId: terms?.interestCategoryId ?? null,
    propertyAccountId: terms?.propertyAccountId ?? null,
  };
}

export type MortgageDraft = ReturnType<typeof draftFromTerms>;

/** True when the first payment is on or before the opening date. The terms cannot be saved then. */
export function firstPaymentNotAfterOpening(openingDate: string, draft: MortgageDraft): boolean {
  return openingDate.length > 0 && draft.firstPaymentDate.length > 0 && draft.firstPaymentDate <= openingDate;
}

/** The terms are off while every field the user must fill is empty. */
export function draftIsBlank(draft: MortgageDraft): boolean {
  return (
    draft.rate.trim().length === 0 &&
    draft.payment.trim().length === 0 &&
    draft.firstPaymentDate.length === 0 &&
    draft.termEnd.length === 0 &&
    draft.months.trim().length === 0 &&
    draft.paymentAccountId === null &&
    draft.interestCategoryId === null &&
    draft.propertyAccountId === null
  );
}

function readPayment(currency: string, text: string) {
  try {
    const milli = parseAmount(currency, text.trim());
    if (milli < 1) {
      throw new Error("Enter the payment as a positive amount.");
    }
    return milli;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Enter ")) {
      throw error;
    }
    throw new Error(decimalsError(currency, text) ?? "Enter the payment as a number.");
  }
}

function readRate(text: string) {
  try {
    return percentToMilliPct(text);
  } catch {
    throw new Error("Enter the interest rate as a percent with up to 3 decimal places.");
  }
}

function readMonths(text: string) {
  if (!/^\d+$/.test(text.trim())) {
    throw new Error("Enter the months left as a whole number.");
  }
  return Number(text.trim());
}

/** Null when the terms are off. Throws an Error with a plain message when a field is wrong. */
export function termsFromDraft(currency: string, draft: MortgageDraft): MortgageTermsWrite | null {
  if (draftIsBlank(draft)) {
    return null;
  }
  if (!draft.paymentAccountId || !draft.interestCategoryId) {
    throw new Error("Choose the payment account and the interest category, or clear the mortgage terms.");
  }
  const parsed = mortgageTermsWriteSchema.safeParse({
    rateMilliPct: readRate(draft.rate),
    compounding: draft.compounding,
    paymentAmount: readPayment(currency, draft.payment),
    paymentFrequency: draft.frequency,
    firstPaymentDate: draft.firstPaymentDate,
    termEnd: draft.termEnd,
    amortizationMonthsRemaining: readMonths(draft.months),
    paymentAccountId: draft.paymentAccountId,
    interestCategoryId: draft.interestCategoryId,
    propertyAccountId: draft.propertyAccountId,
  });
  if (!parsed.success) {
    throw new Error("Fill in every mortgage term, or clear the mortgage terms.");
  }
  return parsed.data;
}
