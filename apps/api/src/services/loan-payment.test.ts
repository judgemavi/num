import { mortgageSplitForDate } from "@num/shared";
import { expect, test } from "bun:test";
import { archiveCategory, createCategory } from "./categories";
import { createAccount } from "./accounts";
import { loanPaymentDefaults } from "./loan-payment";
import { createTransaction } from "./transactions";
import { account, saved, tempDatabase } from "./transaction-test-book";

function mortgageBook() {
  const book = tempDatabase();
  const chequing = account(book.db, "Chequing", "chequing");
  const other = account(book.db, "Other chequing", "chequing");
  const interest = createCategory(book.db, { name: "Mortgage interest", kind: "expense", ...saved });
  const terms = {
    rateMilliPct: 5000,
    compounding: "semiannual" as const,
    paymentAmount: 581_600,
    paymentFrequency: "monthly" as const,
    firstPaymentDate: "2026-03-01",
    termEnd: "2031-03-01",
    amortizationMonthsRemaining: 300,
    paymentAccountId: chequing.id,
    interestCategoryId: interest.id,
    propertyAccountId: null,
  };
  const mortgage = createAccount(book.db, {
    name: "Mortgage",
    kind: "mortgage",
    openingDate: "2026-02-01",
    openingBalance: -100_000_000,
    mortgageTerms: terms,
    ...saved,
  });
  return { ...book, chequing, other, interest, mortgage, terms: { ...terms, accountId: mortgage.id } };
}

function loanPayment(book: ReturnType<typeof tempDatabase>, from: string, loanId: string, date: string, categoryId: string) {
  return createTransaction(book.db, {
    accountId: from,
    date,
    amount: -50_000,
    payeeRaw: "Car loan",
    lines: [
      { amount: -10_000, categoryId },
      { amount: -40_000, transferAccountId: loanId },
    ],
    ...saved,
  });
}

test("the start interest of a mortgage with terms comes from the schedule for the date", () => {
  const book = mortgageBook();
  try {
    const scheduled = mortgageSplitForDate({
      terms: book.terms,
      opening: { balance: -100_000_000, date: "2026-02-01" },
      valuations: [],
      date: "2026-04-03",
      fromAccountId: book.chequing.id,
      toAccountId: book.mortgage.id,
      step: 10,
    });
    expect(scheduled?.interest).toBeGreaterThan(0);
    expect(loanPaymentDefaults(book.db, book.mortgage.id, "2026-04-03")).toEqual({
      interest: scheduled?.interest ?? null,
      interestCategoryId: book.interest.id,
    });
    // Before the first payment, the schedule gives no interest.
    expect(loanPaymentDefaults(book.db, book.mortgage.id, "2026-02-15").interest).toBeNull();
  } finally {
    book.close();
  }
});

test("the start interest category comes from the terms, else from the last loan payment to the account", () => {
  const book = mortgageBook();
  try {
    const fees = createCategory(book.db, { name: "Fees", kind: "expense", ...saved });
    loanPayment(book, book.other.id, book.mortgage.id, "2026-05-01", fees.id);
    expect(loanPaymentDefaults(book.db, book.mortgage.id, "2026-05-01").interestCategoryId).toBe(book.interest.id);

    const loan = account(book.db, "Car loan", "loan");
    expect(loanPaymentDefaults(book.db, loan.id, "2026-05-01")).toEqual({ interest: null, interestCategoryId: null });
    const carInterest = createCategory(book.db, { name: "Car interest", kind: "expense", ...saved });
    loanPayment(book, book.chequing.id, loan.id, "2026-03-01", fees.id);
    loanPayment(book, book.other.id, loan.id, "2026-04-01", carInterest.id);
    expect(loanPaymentDefaults(book.db, loan.id, "2026-05-01")).toEqual({ interest: null, interestCategoryId: carInterest.id });
    // An archived category is not a start value: the next latest payment gives it.
    archiveCategory(book.db, carInterest.id, saved);
    expect(loanPaymentDefaults(book.db, loan.id, "2026-05-01").interestCategoryId).toBe(fees.id);

    const savings = account(book.db, "Savings", "savings");
    expect(loanPaymentDefaults(book.db, savings.id, "2026-05-01")).toEqual({ interest: null, interestCategoryId: null });
  } finally {
    book.close();
  }
});
