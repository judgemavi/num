import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { roundToStep } from "./currency";
import { clampDay, daysBetween, isoDateSchema } from "./date";
import { queryNumber } from "./list";
import { interestRateMilliPctSchema } from "./rate";
import { amountSchema, nonNegativeAmountSchema as money, positiveAmountSchema } from "./money";

export const compounding = ["monthly", "semiannual"] as const;
export const paymentFrequencies = ["weekly", "biweekly", "semimonthly", "monthly"] as const;

export type Compounding = (typeof compounding)[number];
export type PaymentFrequency = (typeof paymentFrequencies)[number];

export const mortgageTermsWriteSchema = z.object({
  rateMilliPct: interestRateMilliPctSchema,
  compounding: z.enum(compounding),
  paymentAmount: positiveAmountSchema,
  paymentFrequency: z.enum(paymentFrequencies),
  firstPaymentDate: isoDateSchema,
  termEnd: isoDateSchema,
  amortizationMonthsRemaining: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  paymentAccountId: z.uuid(),
  interestCategoryId: z.uuid(),
  propertyAccountId: z.uuid().nullable(),
});

export const mortgageTermsSchema = mortgageTermsWriteSchema.extend({
  accountId: z.uuid(),
});

export type MortgageTerms = z.infer<typeof mortgageTermsSchema>;
export type MortgageTermsWrite = z.infer<typeof mortgageTermsWriteSchema>;

/** The amount owed and the date of the account's opening balance. The schedule starts here. */
type MortgageOpening = {
  balance: number;
  date: string;
};

export type MortgageValuation = {
  date: string;
  balance: number;
};

type MortgageLumpSum = {
  date: string;
  amount: number;
};

export type MortgageLoan = {
  principal: number;
  principalAsOf: string;
  rateMilliPct: number;
  compounding: Compounding;
  paymentAmount: number;
  paymentFrequency: PaymentFrequency;
  firstPaymentDate: string;
  extraPerPayment?: number;
  lumpSum?: MortgageLumpSum | null;
  /** The milliunits in one minor unit of the book currency. Interest is rounded to it. */
  step: number;
};

export function mortgageLoan(terms: MortgageTermsWrite, opening: MortgageOpening, step: number): MortgageLoan {
  return {
    principal: Math.abs(opening.balance),
    principalAsOf: opening.date,
    rateMilliPct: terms.rateMilliPct,
    compounding: terms.compounding,
    paymentAmount: terms.paymentAmount,
    paymentFrequency: terms.paymentFrequency,
    firstPaymentDate: terms.firstPaymentDate,
    step,
  };
}

type MortgagePaymentRow = {
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

type MortgageSchedule = {
  payments: MortgagePaymentRow[];
  payoffDate: string | null;
  totalInterest: number;
  remaining: number;
  nonAmortizing: boolean;
};

type MortgageSplit = {
  principal: number;
  interest: number;
  interestCategoryId: string;
  payment: number;
};

const periodsPerYear: Record<PaymentFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export function mortgagePeriodRate(rateMilliPct: number, compound: Compounding, frequency: PaymentFrequency): number {
  const nominal = rateMilliPct / 100_000;
  if (nominal === 0) {
    return 0;
  }
  const compounds = compound === "semiannual" ? 2 : 12;
  const periods = periodsPerYear[frequency];
  return Math.expm1(Math.log1p(nominal / compounds) * (compounds / periods));
}

export function mortgagePaymentDate(firstPaymentDate: string, index: number, frequency: PaymentFrequency): string {
  const start = Temporal.PlainDate.from(firstPaymentDate);
  if (frequency === "weekly") {
    return start.add({ days: index * 7 }).toString();
  }
  if (frequency === "biweekly") {
    return start.add({ days: index * 14 }).toString();
  }
  if (frequency === "monthly") {
    return clampDay(start.with({ day: 1 }).add({ months: index }), start.day).toString();
  }
  const firstDay = start.day;
  const otherDay = firstDay <= 15 ? firstDay + 15 : firstDay - 15;
  const months = firstDay <= 15 ? Math.floor(index / 2) : Math.ceil(index / 2);
  const day = index % 2 === 0 ? firstDay : otherDay;
  return clampDay(start.with({ day: 1 }).add({ months }), day).toString();
}

/** True when the first payment is not one payment period after the opening date. The user can still save. */
export function mortgageFirstPaymentOffPeriod(
  openingDate: string,
  firstPaymentDate: string,
  frequency: PaymentFrequency,
): boolean {
  return mortgagePaymentDate(openingDate, 1, frequency) !== firstPaymentDate;
}

function chargeRate(regular: number, periods: number, from: string, to: string, frequency: PaymentFrequency) {
  if (from === to || mortgagePaymentDate(from, 1, frequency) === to) {
    return regular;
  }
  const days = daysBetween(from, to);
  if (days <= 0) {
    return 0;
  }
  return Math.expm1(Math.log1p(regular) * ((days * periods) / 365));
}

function owed(balance: number) {
  return balance < 0 ? -balance : balance;
}

function sortedValuations(valuations: MortgageValuation[]) {
  return [...valuations].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

export function mortgageSchedule(loan: MortgageLoan, valuations: MortgageValuation[] = [], through?: string): MortgageSchedule {
  if (loan.firstPaymentDate < loan.principalAsOf) {
    throw new Error("The first payment is before the principal date");
  }
  const frequency = loan.paymentFrequency;
  const periods = periodsPerYear[frequency];
  const regular = mortgagePeriodRate(loan.rateMilliPct, loan.compounding, frequency);
  const extra = loan.extraPerPayment ?? 0;
  const due = loan.paymentAmount + extra;
  const lump = loan.lumpSum ?? null;
  if (!Number.isSafeInteger(due) || due < 1) {
    throw new Error("Payment amount is not a safe integer");
  }
  if (lump && (!Number.isSafeInteger(lump.amount) || lump.amount < 1)) {
    throw new Error("Lump sum is not a safe integer");
  }
  const dated = sortedValuations(valuations);
  let balance = loan.principal;
  let previous = loan.principalAsOf;
  for (const valuation of dated) {
    if (valuation.date === loan.principalAsOf) {
      balance = owed(valuation.balance);
    }
  }
  if (lump && lump.date === loan.principalAsOf) {
    balance = Math.max(0, balance - lump.amount);
  }
  const payments: MortgagePaymentRow[] = [];
  let totalInterest = 0;
  let nonAmortizing = false;
  let payoffOn: string | null = null;
  let cursor = 0;
  let lumpUsed = lump?.date === loan.principalAsOf;
  const limit = 50 * periods;
  for (let index = 0; index < limit && balance > 0; index += 1) {
    const date = mortgagePaymentDate(loan.firstPaymentDate, index, frequency);
    if (through && date > through) {
      break;
    }
    while (true) {
      const valuation = dated[cursor];
      if (!valuation || valuation.date >= date) break;
      cursor += 1;
      if (valuation.date <= previous) {
        continue;
      }
      balance = owed(valuation.balance);
      previous = valuation.date;
    }
    if (lump && !lumpUsed && lump.date > previous && lump.date < date) {
      balance = Math.max(0, balance - lump.amount);
      lumpUsed = true;
      previous = lump.date;
      if (balance === 0) {
        payoffOn = lump.date;
        break;
      }
    }
    const rate = chargeRate(regular, periods, previous, date, frequency);
    const interest = roundToStep(balance * rate, loan.step);
    const sameDayLump = lump && !lumpUsed && lump.date === date ? lump.amount : 0;
    const payable = due + sameDayLump;
    if (roundToStep(balance * regular, loan.step) >= payable) {
      nonAmortizing = true;
      break;
    }
    // A long first period or a gap can charge more than the payment. The payment is all interest. The rest is added to the balance.
    const covered = Math.min(interest, payable);
    const payment = Math.min(payable, balance + interest);
    const principal = Math.max(0, payment - interest);
    balance += interest - covered - principal;
    if (sameDayLump > 0) {
      lumpUsed = true;
    }
    totalInterest += covered;
    if (![balance, covered, payment, principal, totalInterest].every(Number.isSafeInteger)) {
      throw new Error("Schedule amount is not a safe integer");
    }
    const paymentRow = { date, payment, principal, interest: covered, balance };
    payments.push(paymentRow);
    const valuation = dated[cursor];
    if (valuation?.date === date) {
      balance = owed(valuation.balance);
      paymentRow.balance = balance;
      cursor += 1;
    }
    previous = date;
    if (balance === 0) {
      break;
    }
  }
  const paidOff = balance === 0;
  return {
    payments,
    payoffDate: paidOff ? (payoffOn ?? payments.at(-1)?.date ?? loan.principalAsOf) : null,
    totalInterest,
    remaining: balance,
    nonAmortizing,
  };
}

export function mortgageExtraEffect(
  loan: MortgageLoan,
  valuations: MortgageValuation[],
  extra: { perPayment: number; lumpSum: MortgageLumpSum | null },
): { payoffDate: string | null; interestSaved: number | null } {
  const base = mortgageSchedule(loan, valuations);
  const scenario = mortgageSchedule(
    { ...loan, extraPerPayment: extra.perPayment, lumpSum: extra.lumpSum },
    valuations,
  );
  if (base.payoffDate === null || scenario.payoffDate === null) {
    return { payoffDate: scenario.payoffDate, interestSaved: null };
  }
  return {
    payoffDate: scenario.payoffDate,
    interestSaved: base.totalInterest - scenario.totalInterest,
  };
}

export function mortgagePrefillLines(
  interest: number,
  scheduledPrincipal: number,
  total: number | null,
): { principal: number; interest: number } {
  if (total === null) {
    return { principal: scheduledPrincipal, interest };
  }
  return { interest, principal: total - interest };
}

export function mortgageSplitForDate(input: {
  terms: MortgageTerms;
  opening: MortgageOpening;
  valuations: MortgageValuation[];
  date: string;
  fromAccountId: string;
  toAccountId: string;
  step: number;
}): MortgageSplit | null {
  if (input.fromAccountId !== input.terms.paymentAccountId || input.toAccountId !== input.terms.accountId) {
    return null;
  }
  const schedule = mortgageSchedule(mortgageLoan(input.terms, input.opening, input.step), input.valuations, input.date);
  const row = schedule.payments.at(-1);
  if (!row) {
    return null;
  }
  return {
    principal: row.principal,
    interest: row.interest,
    interestCategoryId: input.terms.interestCategoryId,
    payment: row.payment,
  };
}

const mortgagePaymentSchema = z.object({
  date: isoDateSchema,
  payment: money,
  principal: money,
  interest: money,
  balance: money,
});

const mortgageActualSchema = z.object({
  id: z.uuid(),
  date: isoDateSchema,
  amount: money,
});

const calendarYearSchema = z.number().int().min(1).max(9999);

/** One row of the payment schedule: a scheduled payment, an actual payment, or both. */
export const mortgageScheduleSchema = z.array(
  z.object({
    date: isoDateSchema,
    scheduled: mortgagePaymentSchema.nullable(),
    actual: mortgageActualSchema.nullable(),
  }),
);

export const mortgageScheduleQuerySchema = z.object({
  asOf: isoDateSchema,
  year: queryNumber().min(1).max(9999),
});

export const mortgageViewSchema = z.object({
  balance: amountSchema,
  rateMilliPct: interestRateMilliPctSchema,
  payoffDate: isoDateSchema.nullable(),
  nonAmortizing: z.boolean(),
  termEnd: isoDateSchema,
  paymentAmount: positiveAmountSchema,
  paymentFrequency: z.enum(paymentFrequencies),
  /** The first and the last calendar year with a row in the schedule. Null when the schedule has no row. */
  years: z.object({ first: calendarYearSchema, last: calendarYearSchema }).nullable(),
  extra: z
    .object({
      amount: money,
      lumpSum: money.nullable(),
      lumpDate: isoDateSchema.nullable(),
      payoffDate: isoDateSchema.nullable(),
      interestSaved: z.number().int().nullable(),
    })
    .nullable(),
});

/** The start values of the Loan payment fields. Null when there is no start value. */
export const loanPaymentDefaultsSchema = z.object({
  interest: positiveAmountSchema.nullable(),
  interestCategoryId: z.uuid().nullable(),
});

export const mortgageViewQuerySchema = z
  .object({
    asOf: isoDateSchema,
    extra: queryNumber().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    lumpSum: queryNumber().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    lumpDate: isoDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasAmount = (value.lumpSum ?? 0) > 0;
    const hasDate = value.lumpDate !== undefined;
    if (hasAmount !== hasDate) {
      ctx.addIssue({ code: "custom", path: ["lumpDate"] });
    }
  });

export const loanPaymentDefaultsQuerySchema = z.object({
  accountId: z.uuid(),
  date: isoDateSchema,
});

export type MortgageView = z.infer<typeof mortgageViewSchema>;
