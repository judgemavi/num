import { bucketCategories, bucketEvents, fundingRuns, transactionLines, transactions } from "@num/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import type { WriteTx } from "./write";

export type Reader = Db | WriteTx;

function add(balances: Map<string, number>, id: string, amount: number) {
  balances.set(id, (balances.get(id) ?? 0) + amount);
}

export function bucketBalances(db: Reader, asOf?: string): Map<string, number> {
  const balances = new Map<string, number>();
  const events = db
    .select({
      kind: bucketEvents.kind,
      bucketId: bucketEvents.bucketId,
      otherBucketId: bucketEvents.otherBucketId,
      amount: bucketEvents.amount,
    })
    .from(bucketEvents)
    .leftJoin(fundingRuns, eq(bucketEvents.fundingRunId, fundingRuns.id))
    .where(
      and(
        isNull(bucketEvents.undoneAt),
        asOf ? lte(bucketEvents.date, asOf) : undefined,
        or(isNull(bucketEvents.fundingRunId), isNull(fundingRuns.undoneAt)),
      ),
    )
    .all();

  for (const event of events) {
    if (event.kind === "fund") {
      add(balances, event.bucketId, event.amount);
    } else if (event.kind === "release") {
      add(balances, event.bucketId, -event.amount);
    } else if (event.kind === "move" && event.otherBucketId) {
      add(balances, event.bucketId, -event.amount);
      add(balances, event.otherBucketId, event.amount);
    }
  }

  const lines = db
    .select({
      bucketId: bucketCategories.bucketId,
      total: sql<number>`coalesce(sum(${transactionLines.amount}), 0)`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .innerJoin(bucketCategories, eq(transactionLines.categoryId, bucketCategories.categoryId))
    .where(and(asOf ? lte(transactions.date, asOf) : undefined))
    .groupBy(bucketCategories.bucketId)
    .all();

  for (const line of lines) {
    add(balances, line.bucketId, line.total);
  }
  return balances;
}
