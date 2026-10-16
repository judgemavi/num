import { occurrenceLinks, transactions } from "@num/db";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type { Reader } from "./write";

/** Link facts and indexes. Only the monthly amounts need the payment date join. */
export function loadLinkIndex(db: Reader, withPaymentDates = false) {
  const query = db
    .select({ ...getTableColumns(occurrenceLinks), paymentDate: withPaymentDates ? transactions.date : sql<null>`null` })
    .from(occurrenceLinks);
  const links = (withPaymentDates ? query.leftJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId)) : query).all();
  const byBucket = new Map<string, typeof links>();
  const closedDates = new Map<string, Set<string>>();
  const skipped = new Map<string, Set<string>>();
  const paid = new Map<string, Map<string, string>>();
  const allKeys = new Set<string>();
  const skippedKeys = new Set<string>();
  const postedKeys = new Set<string>();
  const transactionIds = new Set<string>();
  for (const link of links) {
    const key = `${link.bucketId}|${link.dueDate}`;
    allKeys.add(key);
    const group = byBucket.get(link.bucketId) ?? [];
    group.push(link);
    byBucket.set(link.bucketId, group);
    if (link.skipped || link.transactionId) {
      closedDates.set(link.bucketId, (closedDates.get(link.bucketId) ?? new Set()).add(link.dueDate));
    }
    if (link.skipped) {
      skippedKeys.add(key);
      skipped.set(link.bucketId, (skipped.get(link.bucketId) ?? new Set()).add(link.dueDate));
    } else if (link.paymentDate) {
      paid.set(link.bucketId, (paid.get(link.bucketId) ?? new Map()).set(link.dueDate, link.paymentDate));
    }
    if (link.transactionId) {
      postedKeys.add(key);
      transactionIds.add(link.transactionId);
    }
  }
  return { links, byBucket, closedDates, skipped, paid, allKeys, skippedKeys, postedKeys, transactionIds };
}
