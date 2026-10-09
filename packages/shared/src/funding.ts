import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { BucketKind } from "./bucket";
import { isoDateSchema, asOfQuerySchema } from "./date";
import { amountModes } from "./recurring-calc";
import { isUtcTimestamp } from "./time";
import { centsSchema as cents } from "./money";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const billReserveDays = 30;

export function addDays(iso: string, days: number): string {
  return Temporal.PlainDate.from(iso).add({ days }).toString();
}

export type ReservedBill = {
  dueDate: string;
  amount: number;
  linked: boolean;
};

export function nextIncomeDate(asOf: string, dates: readonly string[]): string | null {
  let next: string | null = null;
  for (const date of dates) {
    if (date <= asOf) {
      continue;
    }
    if (next === null || date < next) {
      next = date;
    }
  }
  return next;
}

export function billsReserved(asOf: string, bills: readonly ReservedBill[], nextIncome: string | null): number {
  const end = nextIncome ?? addDays(asOf, billReserveDays);
  let total = 0;
  for (const bill of bills) {
    if (bill.linked || bill.dueDate < asOf || bill.dueDate >= end) {
      continue;
    }
    total += Math.abs(bill.amount);
  }
  return total;
}

export function positiveBalances(balances: readonly number[]): number {
  let total = 0;
  for (const balance of balances) {
    if (balance > 0) {
      total += balance;
    }
  }
  return total;
}

export function unassigned(onBudgetTotal: number, positiveBucketBalances: number, reserved: number): number {
  return onBudgetTotal - positiveBucketBalances - reserved;
}

export function fundingLimit(paycheckAmount: number, free: number): number {
  const paycheck = paycheckAmount > 0 ? paycheckAmount : 0;
  const available = free > 0 ? free : 0;
  return Math.min(paycheck, available);
}

export function roundUpShare(shortfall: number, paychecks: number): number {
  if (shortfall <= 0) {
    return 0;
  }
  if (paychecks <= 0) {
    return shortfall;
  }
  return Math.ceil(shortfall / paychecks);
}

export type FundingBucketInput = {
  id: string;
  kind: BucketKind;
  priority: number;
  balance: number;
  archived: boolean;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
};

export type FundingIncome = {
  planId: string;
  dueDate: string;
};

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function isFirstPaycheckOfMonth(paycheckDate: string, incomes: readonly FundingIncome[]): boolean {
  const month = monthOf(paycheckDate);
  let earliest = paycheckDate;
  for (const income of incomes) {
    if (monthOf(income.dueDate) === month && income.dueDate < earliest) {
      earliest = income.dueDate;
    }
  }
  return paycheckDate === earliest;
}

function withCurrent(incomes: readonly FundingIncome[], planId: string, dueDate: string): FundingIncome[] {
  if (incomes.some((income) => income.planId === planId && income.dueDate === dueDate)) {
    return [...incomes];
  }
  return [...incomes, { planId, dueDate }];
}

function remainingPaychecks(paycheckDate: string, due: string, incomes: readonly FundingIncome[]): number {
  let count = 0;
  for (const income of incomes) {
    if (income.dueDate >= paycheckDate && income.dueDate < due) {
      count += 1;
    }
  }
  return count;
}

function idealAmount(bucket: FundingBucketInput, paycheckDate: string, incomes: readonly FundingIncome[]): number {
  if (bucket.archived) {
    return 0;
  }
  if (bucket.kind === "spending") {
    if (!isFirstPaycheckOfMonth(paycheckDate, incomes)) {
      return 0;
    }
    return Math.max(0, (bucket.refillTo ?? 0) - bucket.balance);
  }
  if (bucket.kind === "sinking") {
    if (bucket.dueDate === null || bucket.amount === null) {
      return 0;
    }
    return roundUpShare(bucket.amount - bucket.balance, remainingPaychecks(paycheckDate, bucket.dueDate, incomes));
  }
  if (bucket.targetDate !== null) {
    return roundUpShare((bucket.target ?? 0) - bucket.balance, remainingPaychecks(paycheckDate, bucket.targetDate, incomes));
  }
  return Math.max(0, bucket.fixedAmount ?? 0);
}

export function fundingProposal(input: {
  paycheckPlanId: string;
  paycheckDate: string;
  paycheckAmount: number;
  unassigned: number;
  buckets: readonly FundingBucketInput[];
  incomes: readonly FundingIncome[];
}): { bucketId: string; amount: number }[] {
  const incomes = withCurrent(input.incomes, input.paycheckPlanId, input.paycheckDate);
  const ordered = [...input.buckets].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
  let room = fundingLimit(input.paycheckAmount, input.unassigned);
  const lines: { bucketId: string; amount: number }[] = [];
  for (const bucket of ordered) {
    if (room <= 0) {
      break;
    }
    const amount = Math.min(idealAmount(bucket, input.paycheckDate, incomes), room);
    if (amount <= 0) {
      continue;
    }
    lines.push({ bucketId: bucket.id, amount });
    room -= amount;
  }
  return lines;
}

export const fundingPositionSchema = z.object({
  asOf: isoDateSchema,
  onBudgetTotal: cents,
  billsReserved: nonNegative,
  unassigned: cents,
  nextIncomeDate: isoDateSchema.nullable(),
});

export const fundingPaycheckSchema = z.object({
  incomeTransactionId: z.uuid(),
  date: isoDateSchema,
  dueDate: isoDateSchema,
  amount: positive,
  payee: z.string(),
  amountMode: z.enum(amountModes),
});

export const fundingPaycheckListSchema = z.object({
  items: z.array(fundingPaycheckSchema),
});

export const fundingProposalQuerySchema = asOfQuerySchema.extend({
  incomeTransactionId: z.uuid(),
});

export const fundingProposalLineSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  amount: positive,
});

export const fundingProposalSchema = z.object({
  incomeTransactionId: z.uuid(),
  date: isoDateSchema,
  dueDate: isoDateSchema,
  payee: z.string(),
  paycheckAmount: positive,
  unassigned: cents,
  limit: nonNegative,
  lines: z.array(fundingProposalLineSchema),
});

export const fundingRunCreateSchema = z.object({
  incomeTransactionId: z.uuid(),
  lines: z
    .array(
      z.object({
        bucketId: z.uuid(),
        amount: positive,
      }),
    )
    .min(1),
});

export const fundingRunSchema = z.object({
  id: z.uuid(),
  incomeTransactionId: z.uuid(),
  date: isoDateSchema,
  payee: z.string(),
  total: nonNegative,
  createdAt: z.string().refine(isUtcTimestamp),
  undoneAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const fundingRunListSchema = z.object({
  items: z.array(fundingRunSchema),
});

export type FundingPosition = z.infer<typeof fundingPositionSchema>;
export type FundingPaycheck = z.infer<typeof fundingPaycheckSchema>;
export type FundingProposal = z.infer<typeof fundingProposalSchema>;
export type FundingRunCreate = z.infer<typeof fundingRunCreateSchema>;
export type FundingRun = z.infer<typeof fundingRunSchema>;
