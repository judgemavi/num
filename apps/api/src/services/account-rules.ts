import { accountClass, allowsInterestRate, type AccountKind, type PaymentPolicy } from "@num/shared";
import { ServiceError } from "../service-error";

export type CardFields = {
  paymentPolicy: PaymentPolicy | null;
  fixedPayment: number | null;
};

type CardInput = {
  paymentPolicy?: PaymentPolicy | null;
  fixedPayment?: number | null;
};

export function accountBalance(input: {
  kind: AccountKind;
  openingBalance: number;
  transactionTotal: number;
  valuation: { balance: number; transactionsAfter: number } | null;
}): number {
  if ((input.kind === "investment" || input.kind === "property") && input.valuation) {
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

export function cardFields(kind: AccountKind, input: CardInput): CardFields {
  const fields: CardFields = {
    paymentPolicy: input.paymentPolicy ?? null,
    fixedPayment: input.fixedPayment ?? null,
  };
  const hasCardValue = Object.values(fields).some((value) => value !== null);
  if (kind !== "credit_card") {
    if (hasCardValue) {
      throw new ServiceError("card_fields_invalid", 400);
    }
    return fields;
  }
  if (fields.paymentPolicy === null) {
    throw new ServiceError("card_fields_invalid", 400, { field: "paymentPolicy" });
  }
  if (fields.paymentPolicy === "fixed" && fields.fixedPayment === null) {
    throw new ServiceError("card_fields_invalid", 400, { field: "fixedPayment" });
  }
  if (fields.paymentPolicy !== "fixed" && fields.fixedPayment !== null) {
    throw new ServiceError("card_fields_invalid", 400, { field: "fixedPayment" });
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
