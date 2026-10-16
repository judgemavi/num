import { describe, expect, test } from "bun:test";
import { roundToStep } from "./currency";
import {
  mortgageExtraEffect,
  mortgageFirstPaymentOffPeriod,
  mortgageLoan,
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

const hundredThousand = 100_000_000;

function loan(patch: Partial<MortgageLoan> & Pick<MortgageLoan, "compounding" | "paymentFrequency" | "paymentAmount" | "rateMilliPct">): MortgageLoan {
  return {
    principal: hundredThousand,
    principalAsOf: "2000-01-01",
    step: 10,
    firstPaymentDate: patch.paymentFrequency === "weekly" ? "2000-01-08" : patch.paymentFrequency === "biweekly" ? "2000-01-15" : "2000-02-01",
    ...patch,
  };
}

describe("mortgage schedule", () => {
  test("semi-annual compounding matches the published monthly, biweekly and weekly payments", () => {
    const monthly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "monthly", paymentAmount: 581_600, rateMilliPct: 5_000 }));
    expect(monthly.payments[0]).toMatchObject({ interest: 412_390, principal: 169_210, payment: 581_600 });
    const term = monthly.payments.slice(0, 60);
    const termInterest = term.reduce((sum, row) => sum + row.interest, 0);
    expect(Math.abs(termInterest - 23_403_800)).toBeLessThanOrEqual(1_000);
    expect(Math.abs((term[59]?.balance ?? 0) - 88_507_500)).toBeLessThanOrEqual(1_000);

    const biweekly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "biweekly", paymentAmount: 268_140, rateMilliPct: 5_000 }));
    expect(biweekly.payments[0]).toMatchObject({ interest: 190_120, principal: 78_020, payment: 268_140 });

    const weekly = mortgageSchedule(loan({ compounding: "semiannual", paymentFrequency: "weekly", paymentAmount: 134_000, rateMilliPct: 5_000 }));
    expect(weekly.payments[0]).toMatchObject({ interest: 95_020, principal: 38_980, payment: 134_000 });
  });

  test("monthly compounding matches the published monthly payment and the equivalent weekly and biweekly payments", () => {
    const monthlyRate = mortgagePeriodRate(6_000, "monthly", "monthly");
    expect(monthlyRate).toBeCloseTo(0.06 / 12, 12);

    const monthly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "monthly", paymentAmount: 599_550, rateMilliPct: 6_000 }));
    expect(monthly.payments[0]).toMatchObject({ interest: 500_000, principal: 99_550, payment: 599_550 });

    const biweekly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "biweekly", paymentAmount: 276_340, rateMilliPct: 6_000 }));
    expect(biweekly.payments[0]).toMatchObject({ interest: 230_460, principal: 45_880, payment: 276_340 });

    const weekly = mortgageSchedule(loan({ compounding: "monthly", paymentFrequency: "weekly", paymentAmount: 138_090, rateMilliPct: 6_000 }));
    expect(weekly.payments[0]).toMatchObject({ interest: 115_160, principal: 22_930, payment: 138_090 });
  });

  test("a valuation replaces the calculated balance from its date", () => {
    const terms: MortgageLoan = {
      principal: 100_000,
      principalAsOf: "2024-01-01",
      rateMilliPct: 0,
      compounding: "monthly",
      paymentAmount: 10_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2024-02-01",
      step: 10,
    };
    const schedule = mortgageSchedule(terms, [{ date: "2024-04-01", balance: -50_000 }]);
    expect(schedule.payments.map((row) => [row.date, row.balance])).toEqual([
      ["2024-02-01", 90_000],
      ["2024-03-01", 80_000],
      ["2024-04-01", 50_000],
      ["2024-05-01", 40_000],
      ["2024-06-01", 30_000],
      ["2024-07-01", 20_000],
      ["2024-08-01", 10_000],
      ["2024-09-01", 0],
    ]);
  });

  test("a mid-period valuation with interest replaces the balance and the next interest", () => {
    const terms: MortgageLoan = {
      principal: 10_000_000,
      principalAsOf: "2025-01-01",
      rateMilliPct: 6_000,
      compounding: "monthly",
      paymentAmount: 500_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2025-02-01",
      step: 10,
    };
    const schedule = mortgageSchedule(terms, [{ date: "2025-02-15", balance: -8_000_000 }]);
    expect(schedule.payments[0]).toMatchObject({ date: "2025-02-01", interest: 50_000, principal: 450_000, balance: 9_550_000 });
    expect(schedule.payments[1]).toMatchObject({ date: "2025-03-01", interest: 18_390, principal: 481_610, balance: 7_518_390 });
    const onPayment = mortgageSchedule(terms, [{ date: "2025-03-01", balance: -7_000_000 }]);
    expect(onPayment.payments[1]).toMatchObject({ date: "2025-03-01", interest: 47_750, principal: 452_250, balance: 7_000_000 });
    expect(onPayment.payments[2]).toMatchObject({ date: "2025-04-01", interest: 35_000 });
  });

  test("prefill returns the principal and interest for a payment date", () => {
    const terms: MortgageTerms = {
      accountId: "00000000-0000-4000-8000-000000000001",
      rateMilliPct: 5_000,
      compounding: "semiannual",
      paymentAmount: 581_600,
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
        opening: { balance: -hundredThousand, date: "2000-01-01" },
        valuations: [],
        date: "2000-02-01",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
        step: 10,
      }),
    ).toEqual({
      principal: 169_210,
      interest: 412_390,
      interestCategoryId: terms.interestCategoryId,
      payment: 581_600,
    });
    expect(
      mortgageSplitForDate({
        terms,
        opening: { balance: -hundredThousand, date: "2000-01-01" },
        valuations: [],
        date: "2000-02-02",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
        step: 10,
      }),
    ).toEqual({
      principal: 169_210,
      interest: 412_390,
      interestCategoryId: terms.interestCategoryId,
      payment: 581_600,
    });
    expect(
      mortgageSplitForDate({
        terms,
        opening: { balance: -hundredThousand, date: "2000-01-01" },
        valuations: [],
        date: "2000-01-15",
        fromAccountId: terms.paymentAccountId,
        toAccountId: terms.accountId,
        step: 10,
      }),
    ).toBeNull();
    expect(mortgagePrefillLines(412_390, 169_210, 700_000)).toEqual({ interest: 412_390, principal: 287_610 });
    expect(mortgagePrefillLines(412_390, 169_210, 581_600 + 50_000)).toEqual({ interest: 412_390, principal: 219_210 });
    expect(
      mortgageSplitForDate({
        terms,
        opening: { balance: -hundredThousand, date: "2000-01-01" },
        valuations: [],
        date: "2000-02-01",
        fromAccountId: terms.accountId,
        toAccountId: terms.accountId,
        step: 10,
      }),
    ).toBeNull();
  });

  test("an extra payment and a lump sum have an exact payoff date and interest saved", () => {
    const terms: MortgageLoan = {
      principal: 100_000,
      principalAsOf: "2024-01-01",
      rateMilliPct: 12_000,
      compounding: "monthly",
      paymentAmount: 30_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2024-02-01",
      step: 10,
    };
    const base = mortgageSchedule(terms);
    expect(base.payoffDate).toBe("2024-05-01");
    expect(base.totalInterest).toBe(2_250);
    const extra = mortgageExtraEffect(terms, [], { perPayment: 10_000, lumpSum: null });
    expect(extra).toEqual({ payoffDate: "2024-04-01", interestSaved: 420 });
    const lump = mortgageExtraEffect(terms, [], { perPayment: 0, lumpSum: { date: "2024-03-01", amount: 20_000 } });
    expect(lump).toEqual({ payoffDate: "2024-04-01", interestSaved: 320 });
    const both = mortgageExtraEffect(terms, [], { perPayment: 10_000, lumpSum: { date: "2024-03-01", amount: 20_000 } });
    expect(both).toEqual({ payoffDate: "2024-04-01", interestSaved: 620 });
  });

  test("interest is a whole number of the currency's minor unit: whole yen in a JPY book", () => {
    const yen = mortgageSchedule(
      loan({ compounding: "semiannual", paymentFrequency: "monthly", paymentAmount: 58_160_000, rateMilliPct: 5_000, principal: 10_000_000_000, step: 1000 }),
    );
    expect(yen.payments[0]).toMatchObject({ interest: 41_239_000, principal: 16_921_000 });
    expect(yen.payments.every((row) => row.interest % 1000 === 0 && row.principal % 1000 === 0 && row.balance % 1000 === 0)).toBe(true);
  });

  test("twice a month uses two dates in the month", () => {
    expect(mortgagePaymentDate("2026-01-15", 0, "semimonthly")).toBe("2026-01-15");
    expect(mortgagePaymentDate("2026-01-15", 1, "semimonthly")).toBe("2026-01-30");
    expect(mortgagePaymentDate("2026-01-15", 2, "semimonthly")).toBe("2026-02-15");
  });

  const stubLoan: MortgageLoan = {
    principal: 540_810_300,
    principalAsOf: "2024-04-12",
    rateMilliPct: 4_990,
    compounding: "semiannual",
    paymentAmount: 785_580,
    paymentFrequency: "weekly",
    firstPaymentDate: "2024-05-01",
    step: 10,
  };

  test("a first period that charges more than the payment is all interest and the rest is added to the balance", () => {
    const schedule = mortgageSchedule(stubLoan);
    expect(schedule.nonAmortizing).toBe(false);
    expect(schedule.payments.length).toBeGreaterThan(1000);
    const first = schedule.payments[0];
    if (!first) throw new Error("The first payment is missing.");
    expect(first).toMatchObject({ date: "2024-05-01", payment: 785_580, principal: 0, interest: 785_580 });
    expect(first.balance).toBeGreaterThan(stubLoan.principal);
    const regular = mortgagePeriodRate(4_990, "semiannual", "weekly");
    const second = schedule.payments[1];
    if (!second) throw new Error("The second payment is missing.");
    expect(second.interest).toBe(roundToStep(first.balance * regular, 10));
    expect(second.principal).toBe(785_580 - second.interest);
    expect(second.principal).toBeGreaterThan(0);
    expect(schedule.payments.every((row) => row.principal >= 0 && row.interest >= 0)).toBe(true);
    expect(schedule.payoffDate).not.toBeNull();
  });

  test("a payment below the regular interest is non-amortizing", () => {
    const schedule = mortgageSchedule({ ...stubLoan, paymentAmount: 400_000 });
    expect(schedule.nonAmortizing).toBe(true);
    expect(schedule.payments).toEqual([]);
    expect(schedule.payoffDate).toBeNull();
  });
});

describe("opening balance and opening date", () => {
  const terms = {
    rateMilliPct: 5_000,
    compounding: "semiannual" as const,
    paymentAmount: 581_600,
    paymentFrequency: "monthly" as const,
    firstPaymentDate: "2000-02-01",
    termEnd: "2005-01-01",
    amortizationMonthsRemaining: 300,
    paymentAccountId: "00000000-0000-4000-8000-000000000002",
    interestCategoryId: "00000000-0000-4000-8000-000000000003",
    propertyAccountId: null,
  };

  test("the schedule starts from the amount owed on the opening date", () => {
    const loan = mortgageLoan(terms, { balance: -hundredThousand, date: "2000-01-01" }, 10);
    expect(loan).toMatchObject({ principal: hundredThousand, principalAsOf: "2000-01-01" });
    const schedule = mortgageSchedule(loan);
    expect(schedule.payments[0]).toMatchObject({ date: "2000-02-01", interest: 412_390, principal: 169_210 });
  });

  test("a different opening balance changes the schedule and the split", () => {
    const base = mortgageSchedule(mortgageLoan(terms, { balance: -hundredThousand, date: "2000-01-01" }, 10));
    const lower = mortgageSchedule(mortgageLoan(terms, { balance: -50_000_000, date: "2000-01-01" }, 10));
    const firstLower = lower.payments[0];
    const firstBase = base.payments[0];
    if (!firstLower || !firstBase) throw new Error("The first payments are missing.");
    expect(firstLower.interest).toBeLessThan(firstBase.interest);
    expect(firstLower.balance).toBeLessThan(firstBase.balance);
    const split = (balance: number) =>
      mortgageSplitForDate({
        terms: { ...terms, accountId: "00000000-0000-4000-8000-000000000001" },
        opening: { balance, date: "2000-01-01" },
        valuations: [],
        date: "2000-02-01",
        fromAccountId: terms.paymentAccountId,
        toAccountId: "00000000-0000-4000-8000-000000000001",
        step: 10,
      });
    expect(split(-hundredThousand)?.interest).toBe(412_390);
    expect(split(-50_000_000)?.interest).toBe(206_200);
  });

  test("a later opening date charges interest from that date", () => {
    const early = mortgageSchedule(mortgageLoan(terms, { balance: -hundredThousand, date: "2000-01-01" }, 10));
    const late = mortgageSchedule(mortgageLoan(terms, { balance: -hundredThousand, date: "2000-01-16" }, 10));
    const firstLate = late.payments[0];
    const firstEarly = early.payments[0];
    if (!firstLate || !firstEarly) throw new Error("The first payments are missing.");
    expect(firstLate.interest).toBeLessThan(firstEarly.interest);
  });

  test("the first payment warning fires when the first payment is not one period after the opening date", () => {
    expect(mortgageFirstPaymentOffPeriod("2026-03-01", "2026-04-01", "monthly")).toBe(false);
    expect(mortgageFirstPaymentOffPeriod("2026-03-12", "2026-04-01", "monthly")).toBe(true);
    expect(mortgageFirstPaymentOffPeriod("2026-03-01", "2026-03-15", "biweekly")).toBe(false);
    expect(mortgageFirstPaymentOffPeriod("2026-03-01", "2026-03-22", "weekly")).toBe(true);
    expect(mortgageFirstPaymentOffPeriod("2026-01-31", "2026-02-28", "monthly")).toBe(false);
  });
});
