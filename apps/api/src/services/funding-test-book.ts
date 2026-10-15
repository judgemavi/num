import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";
import type { Db } from "../db";
import { saved } from "./bucket-test-book";

export function account(db: Db, name: string, kind: "chequing" | "credit_card" | "property", openingBalance: number) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    paymentPolicy: kind === "credit_card" ? "manual" : null,
    ...saved,
  });
}

export function addSchedule(
  db: Db,
  input: {
    name: string;
    kind: "income" | "commitment";
    accountId: string;
    expectedAmount: number;
    amountMode?: "fixed" | "variable";
    startDate: string;
    bucketStartDate?: string;
    freq: "weekly" | "monthly" | "yearly";
    interval: number;
    monthDay?: number;
    categoryId?: string;
    transferAccountId?: string;
    payday?: boolean;
    essential?: boolean;
  },
) {
  return createSchedule(db, {
    ...input,
    amountMode: input.amountMode ?? "fixed",
    tolerance: 0,
    businessDayShift: "none",
    ...saved,
  });
}

const noKindFields = {
  refillTo: null,
  amount: null,
  dueDate: null,
  repeat: null,
  target: null,
  targetDate: null,
  fixedAmount: null,
  months: null,
  schedule: null,
} as const;

type BucketOptions = { priority?: number; startDate?: string; essential?: boolean; categoryIds?: string[] };

function bucket(name: string, options: BucketOptions) {
  return {
    name,
    priority: options.priority ?? 1,
    essential: options.essential ?? false,
    color: "mint" as const,
    icon: "shopping-cart" as const,
    categoryIds: options.categoryIds ?? [],
    startDate: options.startDate ?? "2000-01-01",
    asOf: "2000-01-01",
    ...saved,
  };
}

export function spend(db: Db, name: string, refillTo = 100_000, options: BucketOptions = {}) {
  return createBucket(db, { ...bucket(name, options), ...noKindFields, kind: "spending", refillTo });
}

export function sinking(db: Db, name: string, amount: number, dueDate: string, options: BucketOptions = {}) {
  return createBucket(db, { ...bucket(name, options), ...noKindFields, kind: "sinking", amount, dueDate, repeat: "none" });
}

export function emergency(db: Db, months: number, options: BucketOptions = {}) {
  return createBucket(db, { ...bucket("Emergency fund", { essential: true, ...options }), ...noKindFields, kind: "emergency", months });
}

export function money(db: Db, accountId: string, categoryId: string, date: string, amount: number, payeeRaw: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw,
    lines: [{ amount, categoryId }],
    ...saved,
  });
}
