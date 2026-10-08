import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { isoDateSchema } from "./date";
import { interestRateMilliPctSchema } from "./rate";

export const compounding = ["monthly", "semiannual"] as const;
export const paymentFrequencies = ["weekly", "biweekly", "semimonthly", "monthly"] as const;

export type Compounding = (typeof compounding)[number];
export type PaymentFrequency = (typeof paymentFrequencies)[number];

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCents = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const mortgageTermsWriteSchema = z.object({
  principal: cents,
  principalAsOf: isoDateSchema,
  rateMilliPct: interestRateMilliPctSchema,
  compounding: z.enum(compounding),
  paymentAmount: positiveCents,
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

export type MortgageValuation = {
  date: string;
  balance: number;
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
};

export type MortgagePaymentRow = {
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export type MortgageSchedule = {
  payments: MortgagePaymentRow[];
  payoffDate: string | null;
  totalInterest: number;
  remaining: number;
  nonAmortizing: boolean;
};

export type MortgageSplit = {
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

export function mortgagePaymentCents(principal: number, periodicRate: number, paymentCount: number): number {
  if (paymentCount <= 0) {
    throw new Error("Payment count must be positive");
  }
  if (periodicRate === 0) {
    return Math.round(principal / paymentCount);
  }
  const raw = (principal * periodicRate) / -Math.expm1(-paymentCount * Math.log1p(periodicRate));
  return Math.round(raw);
}

function clampDay(month: Temporal.PlainDate, day: number): string {
  return month.with({ day: Math.min(day, month.daysInMonth) }).toString();
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
    return clampDay(start.with({ day: 1 }).add({ months: index }), start.day);
  }
  const firstDay = start.day;
  const otherDay = firstDay <= 15 ? firstDay + 15 : firstDay - 15;
  const months = firstDay <= 15 ? Math.floor(index / 2) : Math.ceil(index / 2);
  const day = index % 2 === 0 ? firstDay : otherDay;
  return clampDay(start.with({ day: 1 }).add({ months }), day);
}

function daysBetween(from: string, to: string): number {
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: "day" }).days;
}

function chargeRate(regular: number, periods: number, from: string, to: string, frequency: PaymentFrequency): number {
  if (from === to || mortgagePaymentDate(from, 1, frequency) === to) {
    return regular;
  }
  const days = daysBetween(from, to);
  if (days <= 0) {
    return 0;
  }
  return Math.expm1(Math.log1p(regular) * ((days * periods) / 365));
}

function owed(balance: number): number {
  return balance < 0 ? -balance : balance;
}

function sortedValuations(valuations: MortgageValuation[]): MortgageValuation[] {
  return [...valuations].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

export function mortgageSchedule(loan: MortgageLoan, valuations: MortgageValuation[] = []): MortgageSchedule {
  if (loan.firstPaymentDate < loan.principalAsOf) {
    throw new Error("The first payment is before the principal date");
  }
  const frequency = loan.paymentFrequency;
  const periods = periodsPerYear[frequency];
  const regular = mortgagePeriodRate(loan.rateMilliPct, loan.compounding, frequency);
  const extra = loan.extraPerPayment ?? 0;
  const due = loan.paymentAmount + extra;
  if (!Number.isSafeInteger(due) || due < 1) {
    throw new Error("Payment amount is not a safe integer");
  }
  const checkpoints = sortedValuations(valuations);
  let balance = loan.principal;
  let previous = loan.principalAsOf;
  for (const valuation of checkpoints) {
    if (valuation.date === loan.principalAsOf) {
      balance = owed(valuation.balance);
    }
  }
  const payments: MortgagePaymentRow[] = [];
  let totalInterest = 0;
  let nonAmortizing = false;
  let cursor = 0;
  const limit = 50 * periods;
  for (let index = 0; index < limit && balance > 0; index += 1) {
    const date = mortgagePaymentDate(loan.firstPaymentDate, index, frequency);
    let rate = index === 0 ? chargeRate(regular, periods, previous, date, frequency) : regular;
    while (cursor < checkpoints.length && checkpoints[cursor].date <= date) {
      const valuation = checkpoints[cursor];
      cursor += 1;
      if (valuation.date <= previous) {
        continue;
      }
      balance = owed(valuation.balance);
      if (valuation.date < date) {
        previous = valuation.date;
        rate = chargeRate(regular, periods, previous, date, frequency);
      } else {
        rate = regular;
      }
    }
    const interest = Math.round(balance * rate);
    if (interest >= due) {
      nonAmortizing = true;
      break;
    }
    const payment = Math.min(due, balance + interest);
    const principal = payment - interest;
    balance -= principal;
    totalInterest += interest;
    if (![balance, interest, payment, principal, totalInterest].every(Number.isSafeInteger)) {
      throw new Error("Schedule amount is not a safe integer");
    }
    payments.push({ date, payment, principal, interest, balance });
    previous = date;
    if (balance === 0) {
      break;
    }
  }
  const paidOff = balance === 0;
  return {
    payments,
    payoffDate: paidOff ? (payments.at(-1)?.date ?? loan.principalAsOf) : null,
    totalInterest,
    remaining: balance,
    nonAmortizing,
  };
}

export function mortgageBalanceAsOf(loan: MortgageLoan, valuations: MortgageValuation[], asOf: string): number {
  if (asOf < loan.principalAsOf) {
    return loan.principal;
  }
  const schedule = mortgageSchedule(loan, valuations);
  let balance = loan.principal;
  for (const valuation of sortedValuations(valuations)) {
    if (valuation.date === loan.principalAsOf) {
      balance = owed(valuation.balance);
    }
  }
  const paid = schedule.payments.filter((row) => row.date <= asOf);
  const lastPaid = paid.at(-1);
  if (lastPaid) {
    balance = lastPaid.balance;
  }
  let latest = lastPaid?.date ?? loan.principalAsOf;
  for (const valuation of sortedValuations(valuations)) {
    if (valuation.date > latest && valuation.date <= asOf) {
      balance = owed(valuation.balance);
      latest = valuation.date;
    }
  }
  return balance;
}

export function mortgageNextPayments(schedule: MortgageSchedule, asOf: string, count: number): MortgagePaymentRow[] {
  return schedule.payments.filter((row) => row.date >= asOf).slice(0, count);
}

export function mortgageExtraEffect(
  loan: MortgageLoan,
  valuations: MortgageValuation[],
  extraPerPayment: number,
): { payoffDate: string | null; interestSaved: number | null } {
  const base = mortgageSchedule(loan, valuations);
  const extra = mortgageSchedule({ ...loan, extraPerPayment }, valuations);
  if (base.payoffDate === null || extra.payoffDate === null) {
    return { payoffDate: extra.payoffDate, interestSaved: null };
  }
  return {
    payoffDate: extra.payoffDate,
    interestSaved: base.totalInterest - extra.totalInterest,
  };
}

export function mortgageSplitForDate(input: {
  terms: MortgageTerms;
  valuations: MortgageValuation[];
  date: string;
  fromAccountId: string;
  toAccountId: string;
}): MortgageSplit | null {
  if (input.fromAccountId !== input.terms.paymentAccountId || input.toAccountId !== input.terms.accountId) {
    return null;
  }
  const schedule = mortgageSchedule(input.terms, input.valuations);
  const row = schedule.payments.find((payment) => payment.date === input.date);
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

export const mortgagePaymentSchema = z.object({
  date: isoDateSchema,
  payment: cents,
  principal: cents,
  interest: cents,
  balance: cents,
});

export const mortgageViewSchema = z.object({
  balance: cents,
  rateMilliPct: interestRateMilliPctSchema,
  payoffDate: isoDateSchema.nullable(),
  totalInterest: cents,
  termEnd: isoDateSchema,
  paymentAmount: positiveCents,
  paymentFrequency: z.enum(paymentFrequencies),
  nextPayments: z.array(mortgagePaymentSchema),
  extra: z
    .object({
      amount: positiveCents,
      payoffDate: isoDateSchema.nullable(),
      interestSaved: z.number().int().nullable(),
    })
    .nullable(),
});

export const mortgagePrefillSchema = z.object({
  principal: cents,
  interest: cents,
  interestCategoryId: z.uuid(),
  payment: positiveCents,
});

export const mortgageViewQuerySchema = z.object({
  asOf: isoDateSchema,
  extra: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export const mortgagePrefillQuerySchema = z.object({
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
  date: isoDateSchema,
});

export type MortgageView = z.infer<typeof mortgageViewSchema>;
export type MortgagePrefill = z.infer<typeof mortgagePrefillSchema>;
