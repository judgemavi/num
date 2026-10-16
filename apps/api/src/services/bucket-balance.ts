import { idIn } from "./list-sql";
import { bucketCategories, bucketEvents, buckets, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { and, eq, gte, isNotNull, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Reader } from "./write";

function add(balances: Map<string, number>, id: string, amount: number) {
  balances.set(id, (balances.get(id) ?? 0) + amount);
}

const owner = alias(buckets, "link_owner");

// Spec §5.8 (a recede is money back to Unassigned, as a release is): events count on all dates. Lines count only from the bucket's start date.
// A commitment counts the full amount of its linked payments. Its payment does not count in a category bucket.
export function bucketBalances(db: Reader, asOf?: string, bucketIds?: readonly string[]): Map<string, number> {
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
        bucketIds ? or(idIn(bucketEvents.bucketId, [...bucketIds]), idIn(bucketEvents.otherBucketId, [...bucketIds])) : undefined,
        asOf ? lte(bucketEvents.date, asOf) : undefined,
      ),
    )
    .all();

  for (const event of events) {
    if (event.kind === "fund" || event.kind === "cover") {
      add(balances, event.bucketId, event.amount);
    } else if (event.kind === "release" || event.kind === "recede") {
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
    .where(
      and(
        bucketIds ? idIn(buckets.id, [...bucketIds]) : undefined,
        gte(transactions.date, buckets.startDate),
        asOf ? lte(transactions.date, asOf) : undefined,
        notExists(
          db
            .select({ id: occurrenceLinks.id })
            .from(occurrenceLinks)
            .innerJoin(owner, eq(owner.id, occurrenceLinks.bucketId))
            .where(and(eq(occurrenceLinks.transactionId, transactions.id), eq(owner.kind, "commitment"))),
        ),
      ),
    )
    .groupBy(bucketCategories.bucketId)
    .all();

  for (const line of lines) {
    add(balances, line.bucketId, line.total);
  }

  const payments = db
    .select({
      bucketId: occurrenceLinks.bucketId,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(occurrenceLinks)
    .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
    .innerJoin(buckets, eq(buckets.id, occurrenceLinks.bucketId))
    .where(
      and(
        isNotNull(occurrenceLinks.transactionId),
        eq(buckets.kind, "commitment"),
        bucketIds ? idIn(buckets.id, [...bucketIds]) : undefined,
        gte(transactions.date, buckets.startDate),
        asOf ? lte(transactions.date, asOf) : undefined,
      ),
    )
    .groupBy(occurrenceLinks.bucketId)
    .all();

  for (const payment of payments) {
    add(balances, payment.bucketId, payment.total);
  }
  if (bucketIds) return new Map(bucketIds.map((id) => [id, balances.get(id) ?? 0]));
  return balances;
}
