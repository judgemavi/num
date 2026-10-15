import {
  accountClass,
  allowsInterestRate,
  balanceFromEntry,
  entryFromBalance,
  amountText,
  milliPctToPercent,
  percentToMilliPct,
  parseAmount,
  type Account,
  type MortgageTerms,
} from "@num/shared";
import { draftFromTerms, draftIsBlank, firstPaymentNotAfterOpening, termsFromDraft } from "@/accounts/mortgage-draft";
import { localAsOf } from "@/as-of";
import { editPatch, keptAmount } from "@/forms/form-values";
import { decimalsError } from "@/money";

/** The start values of the Account form. A saved account gives its values and its mortgage terms. */
export function accountValues(account: Account | null, terms: MortgageTerms | null, initialName: string) {
  return {
    name: account?.name ?? initialName,
    institution: account?.institution ?? "",
    kind: account?.kind ?? "chequing",
    onBudget: account?.onBudget ?? true,
    /** True while the opening date follows the first transaction, or today. */
    automatic: account ? account.openingAutomatic : true,
    openingDate: account?.openingDate ?? automaticOpeningDate(account),
    openingBalance: account ? amountText(entryFromBalance(account.kind, account.openingBalance)) : "",
    paymentPolicy: account?.paymentPolicy ?? null,
    fixedPayment: account?.fixedPayment === null || account?.fixedPayment === undefined ? "" : amountText(account.fixedPayment),
    interestRate:
      account?.interestRateMilliPct === null || account?.interestRateMilliPct === undefined ? "" : milliPctToPercent(account.interestRateMilliPct),
    mortgage: draftFromTerms(terms),
  };
}

type AccountValues = ReturnType<typeof accountValues>;

/** The values of a new account. A form part made with `withForm` gets the type of the form values from them. */
export const blankAccount = accountValues(null, null, "");

/** The date that the account uses when the person does not choose one. */
export function automaticOpeningDate(account: Account | null) {
  return account?.automaticOpeningDate ?? localAsOf();
}

function readAmount(currency: string, text: string, label: string) {
  try {
    return parseAmount(currency, text.trim());
  } catch {
    throw new Error(decimalsError(currency, text) ?? `Enter ${label} as a number.`);
  }
}

function readInterest(text: string) {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return percentToMilliPct(text);
  } catch (error) {
    if (error instanceof Error && error.message === "Interest rate is too high") {
      throw new Error("Enter an interest rate from 0 to 1000.");
    }
    throw new Error("Enter the interest rate as a percent with up to 3 decimal places.");
  }
}

/** The saved account and its terms. An unchanged amount or unchanged terms keep the stored values. */
type Stored = { account: Account; terms: MortgageTerms | null } | null;

function checkedBody(currency: string, value: AccountValues, hasSection: boolean, stored: Stored) {
  const termsOn = hasSection && !draftIsBlank(value.mortgage);
  const liability = accountClass(value.kind) === "liability";
  const start = stored ? accountValues(stored.account, stored.terms, "") : null;
  if (value.kind === "credit_card" && value.paymentPolicy === null) {
    throw new Error("Choose how you pay this card.");
  }
  if ((!value.automatic || termsOn) && value.openingDate.trim().length === 0) {
    throw new Error("Enter the date, or use the automatic date.");
  }
  if (termsOn && firstPaymentNotAfterOpening(value.openingDate, value.mortgage)) {
    throw new Error("The first payment must be after the opening date.");
  }
  // An empty field is a zero balance.
  const openingBalance = keptAmount(
    value.openingBalance,
    stored && start ? { text: start.openingBalance, amount: stored.account.openingBalance } : null,
    (text) => (text.trim().length === 0 ? 0 : balanceFromEntry(value.kind, readAmount(currency, text, liability ? "the amount owed" : "the balance"))),
  );
  if (termsOn && openingBalance === 0) {
    throw new Error("Enter the amount owed on the opening date.");
  }
  const card = value.kind === "credit_card";
  const storedFixed = stored?.account.fixedPayment ?? null;
  const fixedStart = start && storedFixed !== null ? { text: start.fixedPayment, amount: storedFixed } : null;
  const sameTerms = stored !== null && start !== null && JSON.stringify(value.mortgage) === JSON.stringify(start.mortgage);
  return {
    name: value.name,
    institution: value.institution.trim().length === 0 ? null : value.institution.trim(),
    kind: value.kind,
    onBudget: value.onBudget,
    openingDate: value.automatic && !termsOn ? null : value.openingDate,
    openingBalance,
    interestRateMilliPct: allowsInterestRate(value.kind) ? readInterest(value.interestRate) : null,
    paymentPolicy: card ? value.paymentPolicy : null,
    fixedPayment:
      card && value.paymentPolicy === "fixed" ? keptAmount(value.fixedPayment, fixedStart, (text) => readAmount(currency, text, "the fixed payment")) : null,
    // A kind that is not a mortgage has no terms. The inline form has no terms section: a mortgage keeps its terms.
    ...(hasSection
      ? { mortgageTerms: sameTerms ? (stored?.terms ?? null) : termsFromDraft(currency, value.mortgage) }
      : value.kind === "mortgage"
        ? {}
        : { mortgageTerms: null }),
  };
}

/** The body of the start values. A saved account that the form cannot read gives an empty body: each field is a change. */
function startBody(currency: string, hasSection: boolean, stored: NonNullable<Stored>) {
  const start = accountValues(stored.account, stored.terms, "");
  try {
    return checkedBody(currency, start, hasSection && start.kind === "mortgage", stored);
  } catch {
    return {};
  }
}

/**
 * The request body of the Account form, or the text of the first error. For a saved account the body is a patch: only
 * the fields that changed, or null with no error when nothing changed. The API checks the body also:
 * an answer with `invalid_body` shows "Check the account fields."
 */
export function accountBody(currency: string, value: AccountValues, hasSection: boolean, stored: Stored) {
  try {
    const body = checkedBody(currency, value, hasSection, stored);
    if (!stored) {
      return { body, patch: null, error: null };
    }
    return { body, patch: editPatch(body, startBody(currency, hasSection, stored)), error: null };
  } catch (caught) {
    return { body: null, patch: null, error: caught instanceof Error ? caught.message : "Check the account fields." };
  }
}
