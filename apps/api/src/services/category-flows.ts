import { categories, transactionLines, transactions } from "@num/db";
import { eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";

function integerSum(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (value <= max && value >= -max) {
      return Number(value);
    }
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error("Sum is not an integer");
}

export function categoryFlows(db: Db): { spending: number; income: number } {
  const rows = db
    .select({
      kind: categories.kind,
      total: sql<unknown>`coalesce(sum(${transactionLines.amount}), 0)`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .innerJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(isNull(transactions.deletedAt))
    .groupBy(categories.kind)
    .all();

  let spending = 0;
  let income = 0;
  for (const row of rows) {
    const total = integerSum(row.total);
    if (row.kind === "expense") {
      spending += total;
    } else if (row.kind === "income") {
      income += total;
    } else {
      throw new Error("Unknown category kind");
    }
  }
  return { spending, income };
}
