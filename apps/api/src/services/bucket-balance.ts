import { bucketCategories, bucketEvents, buckets, transactionLines, transactions } from "@num/db";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Reader } from "./write";

function add(balances: Map<string, number>, id: string, amount: number) {
  balances.set(id, (balances.get(id) ?? 0) + amount);
}

// Spec 5.8 and decision 0029: events count on all dates. Lines count only from the bucket's start date.
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
    .where(
      and(
        isNull(bucketEvents.undoneAt),
        asOf ? lte(bucketEvents.date, asOf) : undefined,
      ),
    )
    .all();

  for (const event of events) {
    if (event.kind === "fund" || event.kind === "cover") {
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
    .innerJoin(buckets, eq(bucketCategories.bucketId, buckets.id))
    .where(and(gte(transactions.date, buckets.startDate), asOf ? lte(transactions.date, asOf) : undefined))
    .groupBy(bucketCategories.bucketId)
    .all();

  for (const line of lines) {
    add(balances, line.bucketId, line.total);
  }
  return balances;
}
