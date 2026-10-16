import { categories, inboxDecisions, transactionLines, transactions } from "@num/db";
import {
  automaticLinkConfidence,
  autoRefundPurchase,
  candidateKind,
  refundCandidates,
  refundQuestionLimit,
  refundWindowStart,
  reversalWindowDays,
  type RefundCandidate,
  type RefundSubject,
} from "@num/shared";
import { and, eq, exists, gt, gte, isNull, lt, lte, notExists, sql } from "drizzle-orm";
import { alias, QueryBuilder, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { idIn } from "./list-sql";
import { auditTransaction, readTransaction } from "./transaction-record";
import { lineCategory, lineCount, literal, refundedSum } from "./transaction-sql";
import type { WriteTx, Reader } from "./write";

type RefundRow = ReturnType<typeof loadRefunds>[number];

const subquery = new QueryBuilder();
const incoming = alias(transactions, "incoming");
const incomingLine = alias(transactionLines, "incoming_line");
const purchaseLine = alias(transactionLines, "purchase_line");

/** Rows with one expense-category line. A transfer or a loan payment is never a refund or a purchase. */
function hasOneExpenseLine(transactionId: AnySQLiteColumn) {
  return and(
    eq(lineCount(transactionId), literal(1)),
    exists(
      subquery
        .select({ found: sql`1` })
        .from(transactionLines)
        .innerJoin(categories, eq(categories.id, transactionLines.categoryId))
        .where(
          and(
            eq(transactionLines.transactionId, transactionId),
            isNull(transactionLines.transferAccountId),
            eq(categories.kind, "expense"),
          ),
        ),
    ),
  );
}

/** The fields of a spending row that a refund can point to. */
const purchaseColumns = {
  id: transactions.id,
  accountId: transactions.accountId,
  date: transactions.date,
  amount: transactions.amount,
  payeeRaw: transactions.payeeRaw,
  payeeNormalized: transactions.payeeNormalized,
  refunded: sql<number>`coalesce(${refundedSum(transactions.id)}, 0)`,
};

function refundItemKey(transactionId: string): string {
  return `refund_link:${transactionId}`;
}

/** Refunds: money in, one expense-category line, no linked purchase. Give an id to read one row. */
function loadRefunds(db: Reader, id?: string, only?: readonly string[]) {
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      payee: transactions.payeeNormalized,
      categoryId: lineCategory(transactions.id),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.mirror, literal(0)),
        gt(transactions.amount, literal(0)),
        isNull(transactions.refundOfId),
        hasOneExpenseLine(transactions.id),
        id ? eq(transactions.id, id) : undefined,
        notExists(subquery.select({ id: inboxDecisions.itemKey }).from(inboxDecisions)
          .where(eq(inboxDecisions.itemKey, sql`'refund_link:' || ${transactions.id}`))),
        only ? idIn(transactions.id, only) : undefined,
      ),
    )
    .all();
}

/** Purchases of these payees dated on or after `from`. An older purchase cannot be a candidate. */
function loadPurchases(db: Reader, payees: readonly string[], from: string) {
  if (payees.length === 0) return [];
  return db
    .select({ ...purchaseColumns, categoryId: lineCategory(transactions.id) })
    .from(transactions)
    .where(and(
      eq(transactions.mirror, literal(0)), lt(transactions.amount, literal(0)), gte(transactions.date, from),
      idIn(transactions.payeeNormalized, payees), hasOneExpenseLine(transactions.id),
    ))
    .all();
}

/**
 * Same-day reversal candidates: spending in the same account and expense category, the same
 * absolute amount, dated 0 to 3 days before the refund. One indexed join; give an id to read one refund.
 */
function loadReversals(db: Reader, id?: string, only?: readonly string[]) {
  const rows = db
    .select({ ...purchaseColumns, refundId: incoming.id, categoryId: incomingLine.categoryId })
    .from(incoming)
    .innerJoin(incomingLine, eq(incomingLine.transactionId, incoming.id))
    .innerJoin(
      transactions,
      and(
        eq(transactions.accountId, incoming.accountId),
        eq(transactions.amount, sql`-${incoming.amount}`),
        lte(transactions.date, incoming.date),
        gte(transactions.date, sql`date(${incoming.date}, ${`-${reversalWindowDays} days`})`),
      ),
    )
    .innerJoin(
      purchaseLine,
      and(eq(purchaseLine.transactionId, transactions.id), eq(purchaseLine.categoryId, incomingLine.categoryId)),
    )
    .where(
      and(
        eq(incoming.mirror, literal(0)),
        gt(incoming.amount, literal(0)),
        isNull(incoming.refundOfId),
        eq(transactions.mirror, literal(0)),
        id ? eq(incoming.id, id) : undefined,
        only ? idIn(incoming.id, only) : undefined,
        hasOneExpenseLine(incoming.id),
        hasOneExpenseLine(transactions.id),
      ),
    )
    .all();
  const found = new Map<string, RefundCandidate[]>();
  for (const { refundId, ...row } of rows) {
    found.set(refundId, [...(found.get(refundId) ?? []), row]);
  }
  return found;
}

function subjectOf(refund: RefundRow): RefundSubject {
  return {
    date: refund.date,
    amount: refund.amount,
    payeeNormalized: refund.payee,
    accountId: refund.accountId,
    categoryId: refund.categoryId,
  };
}

/** Both kinds of candidate for one refund, without duplicates. */
function candidatesFor(refund: RefundRow, byPayee: readonly RefundCandidate[], reversals: readonly RefundCandidate[]) {
  const unique = new Map<string, RefundCandidate>();
  for (const row of [...byPayee, ...reversals]) {
    unique.set(row.id, row);
  }
  return refundCandidates(subjectOf(refund), [...unique.values()]);
}

export type RefundAsk = {
  itemKey: string;
  purchases: { id: string; date: string; amount: number; payeeRaw: string }[];
};

/** Refunds that need the question "Refund of which purchase?". A read: it never writes. */
export function refundQuestions(db: Reader, hidden: ReadonlySet<string>, only?: readonly string[]): Map<string, RefundAsk> {
  const asks = new Map<string, RefundAsk>();
  const refunds = loadRefunds(db, undefined, only).filter((row) => !hidden.has(refundItemKey(row.id)));
  if (refunds.length === 0) {
    return asks;
  }
  const earliest = refunds.reduce((min, row) => (row.date < min ? row.date : min), refunds[0]?.date ?? "");
  const byPayee = new Map<string, RefundCandidate[]>();
  for (const row of loadPurchases(db, refunds.map((item) => item.payee), refundWindowStart(earliest))) {
    byPayee.set(row.payeeNormalized, [...(byPayee.get(row.payeeNormalized) ?? []), row]);
  }
  const reversals = loadReversals(db, undefined, refunds.map((row) => row.id));
  for (const refund of refunds) {
    const found = candidatesFor(refund, byPayee.get(refund.payee) ?? [], reversals.get(refund.id) ?? []);
    if (found.length > 0) {
      asks.set(refund.id, {
        itemKey: refundItemKey(refund.id),
        purchases: found
          .slice(0, refundQuestionLimit)
          .map((row) => ({ id: row.id, date: row.date, amount: row.amount, payeeRaw: row.payeeRaw })),
      });
    }
  }
  return asks;
}

/**
 * A refund that gets its category links itself to its purchase when exactly one candidate
 * has the same amount. It takes the category and the merchant of the purchase and counts as an automatic label.
 */
export function linkRefundIfSure(tx: WriteTx, transactionId: string): void {
  const refund = loadRefunds(tx, transactionId)[0];
  if (!refund || tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, refundItemKey(refund.id))).get()) {
    return;
  }
  const found = candidatesFor(
    refund,
    loadPurchases(tx, [refund.payee], refundWindowStart(refund.date)),
    loadReversals(tx, refund.id).get(refund.id) ?? [],
  );
  const purchaseRef = autoRefundPurchase(refund, found);
  if (!purchaseRef) {
    return;
  }
  const purchase = tx.select().from(transactions).where(eq(transactions.id, purchaseRef.id)).get();
  const category = tx
    .select({ categoryId: transactionLines.categoryId })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, purchaseRef.id))
    .get()?.categoryId;
  if (!purchase || !category) {
    return;
  }
  const before = readTransaction(tx, refund.id);
  tx.update(transactions)
    .set({
      refundOfId: purchase.id,
      merchantId: purchase.merchantId,
      autoReason: candidateKind(subjectOf(refund), purchaseRef) === "reversal" ? "refund_reversal" : "refund_match",
      autoSourceId: purchase.id,
      autoConfidence: automaticLinkConfidence,
    })
    .where(eq(transactions.id, refund.id))
    .run();
  tx.update(transactionLines).set({ categoryId: category }).where(eq(transactionLines.transactionId, refund.id)).run();
  auditTransaction(tx, refund.id, "label", before, readTransaction(tx, refund.id));
}

/** The person removed a link: record the same "no" as "Not linked to a purchase". */
export function recordRefundNo(tx: WriteTx, transactionId: string, at: string): void {
  const itemKey = refundItemKey(transactionId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "not_linked" as const, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}
