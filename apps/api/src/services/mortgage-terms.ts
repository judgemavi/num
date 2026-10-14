import { accounts, categories, mortgageTerms, type MortgageTermRow } from "@num/db";
import type { AccountKind, MortgageTermsWrite } from "@num/shared";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import type { Reader, WriteTx } from "./write";

/** The stored row of the terms. The keys are in the order of the table columns. */
function termsValues(accountId: string, input: MortgageTermsWrite) {
  return {
    accountId,
    rateMilliPct: input.rateMilliPct,
    compounding: input.compounding,
    paymentAmount: input.paymentAmount,
    paymentFrequency: input.paymentFrequency,
    firstPaymentDate: input.firstPaymentDate,
    termEnd: input.termEnd,
    amortizationMonthsRemaining: input.amortizationMonthsRemaining,
    paymentAccountId: input.paymentAccountId,
    interestCategoryId: input.interestCategoryId,
    propertyAccountId: input.propertyAccountId,
  };
}

export function readTerms(db: Reader, accountId: string): MortgageTermRow | undefined {
  return db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, accountId)).get();
}

/**
 * The terms an account write leaves behind. A mortgage keeps its terms when the write leaves them out.
 * An account that is not a mortgage has no terms.
 */
export function resolveTerms(
  db: Reader,
  accountId: string,
  kind: AccountKind,
  requested: MortgageTermsWrite | null | undefined,
): MortgageTermsWrite | null {
  if (kind !== "mortgage") {
    return null;
  }
  if (requested !== undefined) {
    return requested;
  }
  const existing = readTerms(db, accountId);
  return existing ?? null;
}

function assertTerms(db: Reader, accountId: string, opening: { date: string; balance: number }, input: MortgageTermsWrite) {
  if (opening.balance === 0) {
    throw new ServiceError("opening_balance_required", 400);
  }
  if (input.firstPaymentDate <= opening.date || input.termEnd < input.firstPaymentDate) {
    throw new ServiceError("mortgage_terms_invalid", 400);
  }
  const payment = db.select().from(accounts).where(eq(accounts.id, input.paymentAccountId)).get();
  if (!payment || payment.archivedAt !== null || payment.id === accountId) {
    throw new ServiceError("payment_account_invalid", 400);
  }
  const category = db.select().from(categories).where(eq(categories.id, input.interestCategoryId)).get();
  if (!category || category.archivedAt !== null || category.kind !== "expense") {
    throw new ServiceError("interest_category_invalid", 400);
  }
  if (input.propertyAccountId === null) {
    return;
  }
  const property = db.select().from(accounts).where(eq(accounts.id, input.propertyAccountId)).get();
  if (!property || property.archivedAt !== null || property.kind !== "property" || property.id === accountId) {
    throw new ServiceError("property_account_invalid", 400);
  }
}

/** Writes the terms in the transaction of the account write. The account row must exist. */
export function saveTerms(
  tx: WriteTx,
  accountId: string,
  opening: { date: string | null; balance: number },
  input: MortgageTermsWrite | null,
): void {
  const existing = readTerms(tx, accountId);
  if (input === null) {
    if (existing) {
      tx.delete(mortgageTerms).where(eq(mortgageTerms.accountId, accountId)).run();
      tx.audit({ entity: "mortgage_terms", entityId: accountId, action: "delete", before: existing, after: null });
    }
    return;
  }
  if (opening.date === null) {
    throw new ServiceError("mortgage_terms_invalid", 400);
  }
  assertTerms(tx, accountId, { date: opening.date, balance: opening.balance }, input);
  const values = termsValues(accountId, input);
  if (existing && JSON.stringify(existing) === JSON.stringify(values)) {
    return;
  }
  if (existing) {
    tx.update(mortgageTerms).set(values).where(eq(mortgageTerms.accountId, accountId)).run();
  } else {
    tx.insert(mortgageTerms).values(values).run();
  }
  tx.audit({
    entity: "mortgage_terms",
    entityId: accountId,
    action: existing ? "update" : "create",
    before: existing ?? null,
    after: values,
  });
}

export function hasTerms(db: Reader, accountId: string): boolean {
  return readTerms(db, accountId) !== undefined;
}
