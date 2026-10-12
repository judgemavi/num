import { inboxDecisions, transactionLines, transactions } from "@num/db";
import {
  autoRefundPurchase,
  candidateKind,
  refundCandidates,
  refundQuestionLimit,
  refundWindowStart,
  reversalWindowDays,
  type RefundCandidate,
  type RefundSubject,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { auditTransaction, readTransaction } from "./transaction-record";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

type RefundRow = { id: string; accountId: string; categoryId: string | null; date: string; amount: number; payee: string };

/** Rows with one expense-category line. A transfer or a split is never a refund or a purchase. */
function expenseLineOf(alias: string) {
  const t = sql.raw(alias);
  return sql`
  (select count(*) from transaction_lines l where l.transaction_id = ${t}.id) = 1
  and exists (
    select 1 from transaction_lines l
    inner join categories c on c.id = l.category_id
    where l.transaction_id = ${t}.id and l.transfer_account_id is null and c.kind = 'expense'
  )
`;
}

const expenseLine = expenseLineOf("t");

export function refundItemKey(transactionId: string): string {
  return `refund_link:${transactionId}`;
}

/** Refunds: money in, one expense-category line, no linked purchase. Give an id to read one row. */
function loadRefunds(db: Reader, id?: string): RefundRow[] {
  return db.all<RefundRow>(sql`
    select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount, t.payee_normalized as payee,
      (select l.category_id from transaction_lines l where l.transaction_id = t.id) as categoryId
    from transactions t
    where t.mirror = 0 and t.amount > 0 and t.refund_of_id is null
      and ${expenseLine}
      ${id ? sql`and t.id = ${id}` : sql``}
  `);
}

/** Purchases of these payees dated on or after `from`. An older purchase cannot be a candidate. */
function loadPurchases(db: Reader, payees: readonly string[], from: string): RefundCandidate[] {
  const found: RefundCandidate[] = [];
  const unique = [...new Set(payees)];
  for (let index = 0; index < unique.length; index += 400) {
    const list = sql.join(unique.slice(index, index + 400).map((payee) => sql`${payee}`), sql`, `);
    found.push(
      ...db.all<RefundCandidate>(sql`
        select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount, t.payee_raw as payeeRaw,
          t.payee_normalized as payeeNormalized,
          (select l.category_id from transaction_lines l where l.transaction_id = t.id) as categoryId,
          coalesce((select sum(r.amount) from transactions r where r.refund_of_id = t.id), 0) as refunded
        from transactions t
        where t.mirror = 0 and t.amount < 0 and t.date >= ${from} and t.payee_normalized in (${list})
          and ${expenseLine}
      `),
    );
  }
  return found;
}

/**
 * Same-day reversal candidates (decision 0023): spending in the same account and expense category, the same
 * absolute amount, dated 0 to 3 days before the refund. One indexed join; give an id to read one refund.
 */
function loadReversals(db: Reader, id?: string): Map<string, RefundCandidate[]> {
  const rows = db.all<RefundCandidate & { refundId: string }>(sql`
    select r.id as refundId, p.id as id, p.account_id as accountId, p.date as date, p.amount as amount,
      p.payee_raw as payeeRaw, p.payee_normalized as payeeNormalized, rl.category_id as categoryId,
      coalesce((select sum(x.amount) from transactions x where x.refund_of_id = p.id), 0) as refunded
    from transactions r
    inner join transaction_lines rl on rl.transaction_id = r.id
    inner join transactions p on p.account_id = r.account_id and p.amount = -r.amount
      and p.date <= r.date and p.date >= date(r.date, ${`-${reversalWindowDays} days`})
    inner join transaction_lines pl on pl.transaction_id = p.id and pl.category_id = rl.category_id
    where r.mirror = 0 and r.amount > 0 and r.refund_of_id is null and p.mirror = 0
      ${id ? sql`and r.id = ${id}` : sql``}
      and ${expenseLineOf("r")}
      and ${expenseLineOf("p")}
  `);
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
export function refundQuestions(db: Reader, hidden: ReadonlySet<string>): Map<string, RefundAsk> {
  const asks = new Map<string, RefundAsk>();
  const refunds = loadRefunds(db).filter((row) => !hidden.has(refundItemKey(row.id)));
  if (refunds.length === 0) {
    return asks;
  }
  const earliest = refunds.reduce((min, row) => (row.date < min ? row.date : min), refunds[0]?.date ?? "");
  const byPayee = new Map<string, RefundCandidate[]>();
  for (const row of loadPurchases(db, refunds.map((item) => item.payee), refundWindowStart(earliest))) {
    byPayee.set(row.payeeNormalized, [...(byPayee.get(row.payeeNormalized) ?? []), row]);
  }
  const reversals = loadReversals(db);
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
 * Decisions 0022 and 0023. A refund that gets its category links itself to its purchase when exactly one candidate
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
      autoConfidence: 990,
    })
    .where(eq(transactions.id, refund.id))
    .run();
  tx.update(transactionLines).set({ categoryId: category }).where(eq(transactionLines.transactionId, refund.id)).run();
  auditTransaction(tx, refund.id, "label", before, readTransaction(tx, refund.id));
}

/** The person removed a link: record the same "no" as "Not linked to a purchase" (decision 0022). */
export function recordRefundNo(tx: WriteTx, transactionId: string, at: string): void {
  const itemKey = refundItemKey(transactionId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "not_linked", reason: null, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}
