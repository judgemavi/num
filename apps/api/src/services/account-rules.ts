import { accountClass, allowsInterestRate, cardFieldIssue, type AccountKind, type PaymentPolicy } from "@num/shared";
import { ServiceError } from "../service-error";

type CardInput = {
  paymentPolicy?: PaymentPolicy | null;
  fixedPayment?: number | null;
};

/** A valuation sets the balance of these kinds (§5.10). */
export function usesValuation(kind: AccountKind): boolean {
  return kind === "investment" || kind === "property" || kind === "mortgage";
}

export function accountBalance(input: {
  kind: AccountKind;
  openingBalance: number;
  transactionTotal: number;
  valuation: { balance: number; transactionsAfter: number } | null;
}): number {
  if (usesValuation(input.kind) && input.valuation) {
    return input.valuation.balance + input.valuation.transactionsAfter;
  }
  return input.openingBalance + input.transactionTotal;
}

export function assertSameClass(from: AccountKind, to: AccountKind): void {
  if (accountClass(from) !== accountClass(to)) {
    throw new ServiceError("kind_class_mismatch", 400, { kind: to });
  }
}

export function assertCanArchive(balance: number, confirm: boolean): void {
  if (balance !== 0 && !confirm) {
    throw new ServiceError("archive_confirmation_required", 400);
  }
}

/** The route schema uses the same rule. This check is for the stored values that an update keeps and for callers that are not routes. */
export function cardFields(kind: AccountKind, input: CardInput) {
  const fields = {
    paymentPolicy: input.paymentPolicy ?? null,
    fixedPayment: input.fixedPayment ?? null,
  };
  const field = cardFieldIssue({ kind, ...fields });
  if (field) {
    throw new ServiceError("card_fields_invalid", 400, kind === "credit_card" ? { field } : {});
  }
  return fields;
}

export function interestRate(kind: AccountKind, rate: number | null | undefined): number | null {
  const value = rate ?? null;
  if (value !== null && !allowsInterestRate(kind)) {
    throw new ServiceError("interest_rate_invalid", 400);
  }
  return value;
}
