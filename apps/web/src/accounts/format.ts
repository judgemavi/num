import {
  accountClass,
  minorUnitDigits,
  type AccountKind,
  type PaymentPolicy,
} from "@num/shared";

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
  full: "Pay the full statement",
  fixed: "Pay a fixed amount",
  manual: "Choose each payment",
};

export function kindLabel(kind: AccountKind): string {
  return kindLabels[kind];
}

export function policyLabel(policy: PaymentPolicy): string {
  return policyLabels[policy];
}

function minorToNumber(minor: number, digits: number): number {
  const sign = minor < 0 ? -1 : 1;
  const text = Math.abs(minor).toString().padStart(digits + 1, "0");
  if (digits === 0) {
    return sign * Number(text);
  }
  const whole = text.slice(0, -digits);
  const fraction = text.slice(-digits);
  return sign * Number(`${whole}.${fraction}`);
}

export function formatMoney(currency: string, minor: number): string {
  const digits = minorUnitDigits(currency);
  if (digits === undefined) {
    throw new Error("Unknown currency");
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToNumber(minor, digits));
}

export function formatBalance(currency: string, kind: AccountKind, balance: number): string {
  const owed = accountClass(kind) === "liability" && balance < 0;
  const formatted = formatMoney(currency, owed ? -balance : balance);
  return owed ? `Owed ${formatted}` : formatted;
}

export function accountError(code: string): string {
  switch (code) {
    case "kind_class_mismatch":
      return "Choose a kind in the same group.";
    case "archive_confirmation_required":
      return "Confirm that you want to archive an account with a balance.";
    case "card_fields_invalid":
      return "Check the card fields.";
    case "interest_rate_invalid":
      return "This kind of account does not use an interest rate.";
    case "account_not_found":
      return "That account is not in the book.";
    case "account_archived":
      return "This account is already archived.";
    case "invalid_body":
      return "Check the account fields.";
    default:
      return "The account did not save. Try again.";
  }
}
