import { describe, expect, test } from "bun:test";
import {
  mortgageExtraEffect,
  mortgagePaymentDate,
  mortgagePeriodRate,
  mortgagePrefillLines,
  mortgageSchedule,
  mortgageSplitForDate,
  type MortgageLoan,
  type MortgageTerms,
} from "./mortgage";

// Published payments for a synthetic $100,000 loan.
// Semi-annual compounding, 5%, 25-year amortization:
// - Financial Consumer Agency of Canada, Mortgage Calculator
//   https://itools-ioutils.fcac-acfc.gc.ca/MC-CH/MCCalc-CHCalc-eng.aspx
//   Monthly payment $581.60. Over a 5-year term: interest $23,403.80,
//   principal $11,492.50, balance $88,507.50.
// - Vertex42 Canadian Mortgage Calculator
//   https://www.vertex42.com/Calculators/Canadian-mortgage.html
//   Same loan: monthly $581.60, bi-weekly $268.14, weekly $134.00.
// Monthly compounding, 6%, 30-year amortization, monthly payments:
// - Finatopia mortgage calculator, $100,000 at 6% for 30 years, payment $599.55
//   https://www.finatopia.com/calculator/loan/mortgage/100000/600
// Weekly and biweekly payments with monthly compounding use the same equivalent
// periodic rate Vertex42 documents: (1 + nominal/compounds)^(compounds/payments per year) − 1.
// Rounded payments from that formula: weekly $138.09, biweekly $276.34.

const hundredThousand = 10_000_000;

function loan(patch: Partial<MortgageLoan> & Pick<MortgageLoan, "compounding" | "paymentFrequency" | "paymentAmount" | "rateMilliPct">): MortgageLoan {
  return {
    principal: hundredThousand,
    principalAsOf: "2000-01-01",
    firstPaymentDate: patch.paymentFrequency === "weekly" ? "2000-01-08" : patch.paymentFrequency === "biweekly" ? "2000-01-15" : "2000-02-01",
    ...patch,
  };
}

describe("mortgage schedule", () => {
  test("semi-annual compounding matches the published monthly, biweekly and weekly payments", () => {
    const monthly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "monthly", paymentAmount: 58_160, rateMilliPct: 5_000 }));
    expect(monthly.payments[0]).toMatchObject({ interest: 41_239, principal: 16_921, payment: 58_160 });
    const term = monthly.payments.slice(0, 60);
    const termInterest = term.reduce((sum, row) => sum + row.interest, 0);
    expect(Math.abs(termInterest - 2_340_380)).toBeLessThanOrEqual(100);
    expect(Math.abs((term[59]?.balance ?? 0) - 8_850_750)).toBeLessThanOrEqual(100);

    const biweekly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "biweekly", paymentAmount: 26_814, rateMilliPct: 5_000 }));
    expect(biweekly.payments[0]).toMatchObject({ interest: 19_012, principal: 7_802, payment: 26_814 });

    const weekly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "weekly", paymentAmount: 13_400, rateMilliPct: 5_000 }));
    expect(weekly.payments[0]).toMatchObject({ interest: 9_502, principal: 3_898, payment: 13_400 });
  });

  test("monthly compounding matches the published monthly payment and the equivalent weekly and biweekly payments", () => {
    const monthlyRate = mortgagePeriodRate(6_000, "monthly", "monthly");
    expect(monthlyRate).toBeCloseTo(0.06 / 12, 12);

    const monthly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "monthly", paymentAmount: 59_955, rateMilliPct: 6_000 }));
    expect(monthly.payments[0]).toMatchObject({ interest: 50_000, principal: 9_955, payment: 59_955 });

    const biweekly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "biweekly", paymentAmount: 27_634, rateMilliPct: 6_000 }));
    expect(biweekly.payments[0]).toMatchObject({ interest: 23_046, principal: 4_588, payment: 27_634 });

    const weekly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "weekly", paymentAmount: 13_809, rateMilliPct: 6_000 }));
    expect(weekly.payments[0]).toMatchObject({ interest: 11_516, principal: 2_293, payment: 13_809 });
  });

  test("a valuation replaces the calculated balance from its date", () => {
    const terms: MortgageLoan = {
      principal: 10_000,
      principalAsOf: "2024-01-01",
      rateMilliPct: 0,
      compounding: "monthly",
      paymentAmount: 1_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2024-02-01",
    };
    const schedule = mortgageSchedule(terms, [{ date: "2024-04-01", balance: -5_000 }]);
    expect(schedule.payments.map((row) => [row.date, row.balance])).toEqual([
      ["2024-02-01", 9_000],
      ["2024-03-01", 8_000],
      ["2024-04-01", 5_000],
      ["2024-05-01", 4_000],
      ["2024-06-01", 3_000],
      ["2024-07-01", 2_000],
      ["2024-08-01", 1_000],
      ["2024-09-01", 0],
    ]);
  });

  test("a mid-period valuation with interest replaces the balance and the next interest", () => {
    const terms: MortgageLoan = {
      principal: 1_000_000,
      principalAsOf: "2025-01-01",
      rateMilliPct: 6_000,
      compounding: "monthly",
      paymentAmount: 50_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2025-02-01",
    };
    const schedule = mortgageSchedule(terms, [{ date: "2025-02-15", balance: -800_000 }]);
    expect(schedule.payments[0]).toMatchObject({ date: "2025-02-01", interest: 5_000, principal: 45_000, balance: 955_000 });
    expect(schedule.payments[1]).toMatchObject({ date: "2025-03-01", interest: 1_839, principal: 48_161, balance: 751_839 });
    const onPayment = mortgageSchedule(terms, [{ date: "2025-03-01", balance: -700_000 }]);
    expect(onPayment.payments[1]).toMatchObject({ date: "2025-03-01", interest: 4_775, principal: 45_225, balance: 700_000 });
    expect(onPayment.payments[2]).toMatchObject({ date: "2025-04-01", interest: 3_500 });
  });

  test("prefill returns the principal and interest for a payment date", () => {
    const terms: MortgageTerms = {
      accountId: "00000000-0000-4000-8000-000000000001",
      principal: hundredThousand,
      principalAsOf: "2000-01-01",
      rateMilliPct: 5_000,
      compounding: "semiannual",
      paymentAmount: 58_160,
      paymentFrequency: "monthly",
      firstPaymentDate: "2000-02-01",
      termEnd: "2005-01-01",
      amortizationMonthsRemaining: 300,
      paymentAccountId: "00000000-0000-4000-8000-000000000002",
      interestCategoryId: "00000000-0000-4000-8000-000000000003",
      propertyAccountId: null,
    };
    expect(
      mortgageSplitForDate({
        terms,
        valuations: [],
        date: "2000-02-01",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
      }),
    ).toEqual({
      principal: 16_921,
      interest: 41_239,
      interestCategoryId: terms.interestCategoryId,
      payment: 58_160,
    });
    expect(
      mortgageSplitForDate({
        terms,
        valuations: [],
        date: "2000-02-02",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
      }),
    ).toEqual({
      principal: 16_921,
      interest: 41_239,
      interestCategoryId: terms.interestCategoryId,
      payment: 58_160,
    });
    expect(
      mortgageSplitForDate({
        terms,
        valuations: [],
        date: "2000-01-15",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
      }),
    ).toBeNull();
    expect(mortgagePrefillLines(41_239, 16_921, 70_000)).toEqual({ interest: 41_239, principal: 28_761 });
    expect(mortgagePrefillLines(41_239, 16_921, 58_160 + 5_000)).toEqual({ interest: 41_239, principal: 21_921 });
    expect(
      mortgageSplitForDate({
        terms,
        valuations: [],
        date: "2000-02-01",
        fromAccountId: terms.accountId,
        toAccountId: terms.accountId,
      }),
    ).toBeNull();
  });

  test("an extra payment and a lump sum have an exact payoff date and interest saved", () => {
    const terms: MortgageLoan = {
      principal: 10_000,
      principalAsOf: "2024-01-01",
      rateMilliPct: 12_000,
      compounding: "monthly",
      paymentAmount: 3_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2024-02-01",
    };
    const base = mortgageSchedule(terms);
    expect(base.payoffDate).toBe("2024-05-01");
    expect(base.totalInterest).toBe(225);
    const extra = mortgageExtraEffect(terms, [], { perPayment: 1_000, lumpSum: null });
    expect(extra).toEqual({ payoffDate: "2024-04-01", interestSaved: 42 });
    const lump = mortgageExtraEffect(terms, [], { perPayment: 0, lumpSum: { date: "2024-03-01", amount: 2_000 } });
    expect(lump).toEqual({ payoffDate: "2024-04-01", interestSaved: 32 });
    const both = mortgageExtraEffect(terms, [], { perPayment: 1_000, lumpSum: { date: "2024-03-01", amount: 2_000 } });
    expect(both).toEqual({ payoffDate: "2024-04-01", interestSaved: 62 });
  });

  test("twice a month uses two dates in the month", () => {
    expect(mortgagePaymentDate("2026-01-15", 0, "semimonthly")).toBe("2026-01-15");
    expect(mortgagePaymentDate("2026-01-15", 1, "semimonthly")).toBe("2026-01-30");
    expect(mortgagePaymentDate("2026-01-15", 2, "semimonthly")).toBe("2026-02-15");
  });

  const stubLoan: MortgageLoan = {
    principal: 54_081_030,
    principalAsOf: "2024-04-12",
    rateMilliPct: 4_990,
    compounding: "semiannual",
    paymentAmount: 78_558,
    paymentFrequency: "weekly",
    firstPaymentDate: "2024-05-01",
  };

  test("a first period that charges more than the payment is all interest and the rest is added to the balance", () => {
    const schedule = mortgageSchedule(stubLoan);
    expect(schedule.nonAmortizing).toBe(false);
    expect(schedule.payments.length).toBeGreaterThan(1000);
    const first = schedule.payments[0];
    expect(first).toMatchObject({ date: "2024-05-01", payment: 78_558, principal: 0, interest: 78_558 });
    expect(first.balance).toBeGreaterThan(stubLoan.principal);
    const regular = mortgagePeriodRate(4_990, "semiannual", "weekly");
    const second = schedule.payments[1];
    expect(second.interest).toBe(Math.round(first.balance * regular));
    expect(second.principal).toBe(78_558 - second.interest);
    expect(second.principal).toBeGreaterThan(0);
    expect(schedule.payments.every((row) => row.principal >= 0 && row.interest >= 0)).toBe(true);
    expect(schedule.payoffDate).not.toBeNull();
  });

  test("a payment below the regular interest is non-amortizing", () => {
    const schedule = mortgageSchedule({ ...stubLoan, paymentAmount: 40_000 });
    expect(schedule.nonAmortizing).toBe(true);
    expect(schedule.payments).toEqual([]);
    expect(schedule.payoffDate).toBeNull();
  });
});
