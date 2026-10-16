import { expect, test } from "bun:test";
import { accountSchema, bucketSchema, currencyStep, mortgageTermsSchema } from "@num/shared";
import { accountBody, accountValues } from "../accounts/account-values";
import { draftFromTerms, termsFromDraft } from "../accounts/mortgage-draft";
import { bucketBody, bucketValues } from "../buckets/bucket-values";
import { scheduleBody, scheduleValues } from "../schedules/schedule-values";

const id = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const cases = [
  { currency: "JPY", text: "12", milli: 12_000, invalid: "12.1" },
  { currency: "USD", text: "12.34", milli: 12_340, invalid: "12.345" },
  { currency: "KWD", text: "12.345", milli: 12_345, invalid: "12.3456" },
];

function account() {
  return accountSchema.parse({
    id, name: "Test account", institution: null, kind: "credit_card", onBudget: true,
    openingDate: "2026-01-01", openingAutomatic: false, automaticOpeningDate: "2026-01-01",
    automaticFollowsTransactions: false, openingBalance: -12_345, archivedAt: null,
    paymentPolicy: "fixed", fixedPayment: 1_235, interestRateMilliPct: null,
    importPreset: null, columnMap: null, balance: -12_345, hasValuation: false,
  });
}

for (const item of cases) {
  test(`accountBody stores the signed liability and fixed payment in ${item.currency} milliunits`, () => {
    const start = accountValues(account(), null, "");
    const result = accountBody(item.currency, { ...start, openingBalance: item.text, fixedPayment: item.text }, false, null);
    expect(result.error).toBeNull();
    expect(result.body?.openingBalance).toBe(-item.milli);
    expect(result.body?.fixedPayment).toBe(item.milli);
    expect(accountBody(item.currency, { ...start, openingBalance: item.invalid }, false, null).body).toBeNull();
  });

  test(`bucketBody reads the refill in ${item.currency} milliunits and rejects excess decimals`, () => {
    const values = { ...bucketValues(null, "sky", 0), name: "Test spending", startDate: "2026-01-01", refillTo: item.text };
    expect(bucketBody(item.currency, values, null).body?.refillTo).toBe(item.milli);
    expect(bucketBody(item.currency, { ...values, refillTo: item.invalid }, null).body).toBeNull();
  });

  test(`scheduleBody gives bills and income their sign in ${item.currency}`, () => {
    for (const kind of ["commitment", "income"] as const) {
      const values = { ...scheduleValues(kind, "new", "sky"), name: "Test schedule", accountId: id,
        categoryId, bucketStart: "2026-01-01", startDate: "2026-01-02", amount: item.text, tolerance: item.text };
      const result = scheduleBody(item.currency, kind, values, null);
      expect(result.error).toBeNull();
      expect(result.body?.schedule?.expectedAmount).toBe(kind === "income" ? item.milli : -item.milli);
      expect(result.body?.schedule?.tolerance).toBe(item.milli);
      expect(scheduleBody(item.currency, kind, { ...values, amount: item.invalid }, null).body).toBeNull();
    }
  });

  test(`termsFromDraft reads mortgage payments in ${item.currency} milliunits`, () => {
    const values = { ...draftFromTerms(null), rate: "4.125", payment: item.text, firstPaymentDate: "2026-02-01",
      termEnd: "2027-01-01", months: "240", paymentAccountId: id, interestCategoryId: categoryId };
    const terms = termsFromDraft(item.currency, values);
    expect(terms?.paymentAmount).toBe(item.milli);
    if (!terms) throw new Error("The mortgage terms are missing.");
    expect(terms.paymentAmount % currencyStep(item.currency)).toBe(0);
    expect(terms?.rateMilliPct).toBe(4125);
    expect(() => termsFromDraft(item.currency, { ...values, payment: item.invalid })).toThrow();
    expect(() => termsFromDraft(item.currency, { ...values, payment: "0" })).toThrow();
    expect(() => termsFromDraft(item.currency, { ...values, payment: `-${item.text}` })).toThrow();
  });
}

test("accountBody keeps stored fractions on an unchanged edit and on a name change", () => {
  const saved = account();
  const values = accountValues(saved, null, "");
  const stored = { account: saved, terms: null };
  expect(accountBody("JPY", values, false, stored).patch).toBeNull();
  const result = accountBody("JPY", { ...values, name: "Changed" }, false, stored);
  expect(result.body?.openingBalance).toBe(saved.openingBalance);
  expect(result.body?.fixedPayment).toBe(saved.fixedPayment);
  expect(result.patch).toEqual({ name: "Changed" });
  expect(accountBody("USD", { ...values, openingBalance: "20.00" }, false, stored).patch).toEqual({ openingBalance: -20_000 });
});

test("bucketBody keeps a stored refill without rounding it or sending it in a name patch", () => {
  const values = { ...bucketValues(null, "sky", 0), name: "Test spending", startDate: "2026-01-01", refillTo: "12.345" };
  const body = bucketBody("KWD", values, null).body;
  if (!body) throw new Error("The spending fixture is not valid.");
  const saved = bucketSchema.parse({ ...body, id, archivedAt: null, pausedAt: null, balance: 0 });
  const start = bucketValues(saved, "sky", 0);
  expect(bucketBody("JPY", start, saved).patch).toBeNull();
  const changed = bucketBody("JPY", { ...start, name: "Changed" }, saved);
  expect(changed.body?.refillTo).toBe(12_345);
  expect(changed.patch).toEqual({ name: "Changed" });
  expect(bucketBody("USD", { ...start, refillTo: "20.00" }, saved).patch).toEqual({ refillTo: 20_000 });
});

test("scheduleBody keeps the stored amount and tolerance when only the name changes", () => {
  const values = { ...scheduleValues("commitment", "new", "sky"), name: "Test bill", accountId: id, categoryId,
    bucketStart: "2026-01-01", startDate: "2026-01-02", amount: "12.345", tolerance: "0.123" };
  const body = scheduleBody("KWD", "commitment", values, null).body;
  if (!body) throw new Error("The schedule fixture is not valid.");
  const saved = bucketSchema.parse({ ...body, id, archivedAt: null, pausedAt: null, balance: 0 });
  const start = scheduleValues("commitment", saved, "sky");
  expect(scheduleBody("JPY", "commitment", start, saved).patch).toBeNull();
  const result = scheduleBody("JPY", "commitment", { ...start, name: "Changed" }, saved);
  expect(result.body?.schedule?.expectedAmount).toBe(-12_345);
  expect(result.body?.schedule?.tolerance).toBe(123);
  expect(result.patch).toEqual({ name: "Changed" });
});

test("accountBody keeps stored mortgage terms when only the name changes", () => {
  const terms = mortgageTermsSchema.parse({ accountId: id, rateMilliPct: 4125, compounding: "semiannual", paymentAmount: 12_345,
    paymentFrequency: "monthly", firstPaymentDate: "2026-02-01", termEnd: "2027-01-01", amortizationMonthsRemaining: 240,
    paymentAccountId: "00000000-0000-4000-8000-000000000003", interestCategoryId: categoryId, propertyAccountId: null });
  const saved = { ...account(), kind: "mortgage" as const, paymentPolicy: null, fixedPayment: null, onBudget: false };
  const values = accountValues(saved, terms, "");
  const result = accountBody("JPY", { ...values, name: "Changed" }, true, { account: saved, terms });
  expect(result.patch).toEqual({ name: "Changed" });
  expect(result.body?.mortgageTerms?.paymentAmount).toBe(12_345);
  expect(termsFromDraft("JPY", draftFromTerms(null))).toBeNull();
});
