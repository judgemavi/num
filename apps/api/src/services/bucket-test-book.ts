import type { Db } from "../db";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";

export const at = "2026-10-07T16:00:00Z";
export const saved = { source: "ui" as const, at };

export function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", source: "ui", at });
}

export function spending(db: Db, name: string, categoryIds: string[], refillTo = 100_000) {
  return createBucket(db, {
    name,
    kind: "spending",
    priority: 1,
    essential: false,
    color: "mint",
    icon: "shopping-cart",
    categoryIds,
    refillTo,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    canRecede: null,
    schedule: null,
    asOf: "2000-01-01",
    ...saved,
  });
}

export function purchase(db: Db, accountId: string, categoryId: string, amount: number, date = "2026-03-01") {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}
