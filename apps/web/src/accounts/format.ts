import {
  accountClass,
  milliPctToPercent,
  type Account,
  type AccountKind,
  type PaymentPolicy, type ErrorCode } from "@num/shared";
import { formatMoney } from "@/money";

const kindLabels: Record<AccountKind, string> = {
  chequing: "Chequing",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  mortgage: "Mortgage",
  loan: "Loan",
  investment: "Investment",
  property: "Property",
  receivable: "Receivable",
  other_asset: "Other asset",
  other_liability: "Other liability",
};

const policyLabels: Record<PaymentPolicy, string> = {
  full: "Pay the full balance",
  fixed: "Pay a fixed amount",
  manual: "Choose each payment",
};

export function kindLabel(kind: AccountKind): string {
  return kindLabels[kind];
}

export function policyLabel(policy: PaymentPolicy): string {
  return policyLabels[policy];
}

export function formatBalance(currency: string, kind: AccountKind, balance: number): string {
  const owed = accountClass(kind) === "liability" && balance < 0;
  const formatted = formatMoney(currency, owed ? -balance : balance);
  return owed ? `Owed ${formatted}` : formatted;
}

export function accountCountLabel(count: number): string {
  if (count === 0) {
    return "No accounts";
  }
  if (count === 1) {
    return "1 account";
  }
  return `${count} accounts`;
}

export function accountDetail(account: Account): string | null {
  if (account.kind === "savings" && account.interestRateMilliPct !== null) {
    return `Earns ${milliPctToPercent(account.interestRateMilliPct)}% a year`;
  }
  if ((account.kind === "loan" || account.kind === "mortgage") && account.interestRateMilliPct !== null) {
    return `${milliPctToPercent(account.interestRateMilliPct)}% a year`;
  }
  if (account.kind === "credit_card") {
    const parts: string[] = [];
    if (account.paymentPolicy) {
      parts.push(policyLabel(account.paymentPolicy));
    }
    return parts.length === 0 ? null : parts.join(" · ");
  }
  return null;
}

export function accountError(code: ErrorCode | undefined): string {
  switch (code) {
    case "amount_too_precise":
      return "An amount has more decimal places than the currency has.";
    case "account_has_valuations":
      return "Delete the valuations of this account first.";
    case "kind_class_mismatch":
      return "Choose a kind in the same group.";
    case "archive_confirmation_required":
      return "Confirm that you want to archive an account with a balance.";
    case "card_fields_invalid":
      return "Check the card fields.";
    case "interest_rate_invalid":
      return "This kind of account does not use an interest rate.";
    case "mortgage_terms_invalid":
      return "The first payment must be after the opening date. The term must end on or after the first payment.";
    case "payment_account_invalid":
      return "Choose an open account to pay from.";
    case "interest_category_invalid":
      return "Choose an expense category for the interest.";
    case "property_account_invalid":
      return "Choose a property account, or leave the property empty.";
    case "opening_balance_required":
      return "Enter the amount owed on the opening date.";
    case "opening_date_fixed":
      return "This mortgage has a fixed opening date. Change it in the account.";
    case "account_not_found":
      return "That account is not in the book.";
    case "account_archived":
      return "This account is already archived.";
    case "account_not_archived":
      return "This account is already active.";
    case "invalid_body":
      return "Check the account fields.";
    default:
      return "The account did not save. Try again.";
  }
}

/** The text of a failed write of a bank balance. */
export function bankBalanceError(code: ErrorCode | undefined): string {
  switch (code) {
    case "bank_balance_exists":
      return "There is already a bank balance for this date. Change that one.";
    case "amount_too_precise":
      return "An amount has more decimal places than the currency has.";
    default:
      return "The bank balance did not save. Try again.";
  }
}

/** The warning of a mortgage or a loan with a positive balance: the book shows money owed to the person. */
export const owedToYouWarning = "This shows money owed to you. Check the amount owed.";

/** True when a mortgage or a loan has a positive balance. A loan that the person owes has a negative balance. */
export function owedToYou(account: { kind: AccountKind; balance: number }) {
  return (account.kind === "mortgage" || account.kind === "loan") && account.balance > 0;
}

export function valuationError(code: ErrorCode | undefined): string {
  switch (code) {
    case "valuation_exists":
      return "There is already a valuation for this date. Change that one.";
    case "valuation_not_found":
      return "That valuation is not in the book.";
    case "account_kind_no_valuations":
      return "This kind of account does not use valuations.";
    case "amount_too_precise":
      return "An amount has more decimal places than the currency has.";
    case "invalid_body":
      return "Check the valuation fields.";
    default:
      return "The valuation did not save. Try again.";
  }
}
