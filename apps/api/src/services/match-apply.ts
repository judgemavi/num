import { accounts, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { utcNow, type MatchResult } from "@num/shared";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { mortgageLinesFor } from "./mortgage-learned";
import { loadMatchBook, scorePayee } from "./match-book";
import { linkRefundIfSure } from "./refund-auto";
import { auditTransaction, readTransaction } from "./transaction-record";
import { replaceLines } from "./transaction-lines";
import { isOnlyLine, literal } from "./transaction-sql";
import { attachTransfer } from "./transaction-transfer";
import type { WriteTx } from "./write";

type OpenRow = ReturnType<typeof openRows>[number];

export function mortgageSplitLines(tx: WriteTx, result: MatchResult, fromAccountId: string, date: string, amount: number) {
  if (!result.mortgage || !result.transferAccountId) {
    return null;
  }
  return mortgageLinesFor(tx, result.transferAccountId, fromAccountId, date, amount);
}

export function applyLinkedPlan(
  tx: WriteTx,
  plan: { id: string; name: string; categoryId: string | null; merchantId: string | null; transferAccountId: string | null },
  transactionId: string,
  markEdited = false,
): void {
  const txn = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!txn) {
    return;
  }
  const mortgage =
    plan.transferAccountId !== null &&
    tx.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, plan.transferAccountId)).get()?.kind === "mortgage";
  if (!mortgage && plan.categoryId === null) {
    return;
  }
  const result = {
    level: "automatic" as const,
    confidence: 0.99,
    confidenceMilli: 990,
    leadMilli: 1000,
    reason: "recurring" as const,
    sourceId: plan.id,
    categoryId: mortgage ? null : plan.categoryId,
    merchantId: plan.merchantId,
    transferAccountId: mortgage ? plan.transferAccountId : null,
    mortgage,
    signals: [],
  };
  const before = readTransaction(tx, transactionId);
  const lines = mortgage ? mortgageSplitLines(tx, result, txn.accountId, txn.date, txn.amount) : null;
  if (mortgage && !lines) {
    return;
  }
  tx.update(transactions)
    .set({
      merchantId: plan.merchantId ?? txn.merchantId,
      autoReason: "recurring",
      autoSourceId: plan.id,
      autoConfidence: 990,
      ...(markEdited ? { editedAt: utcNow() } : {}),
    })
    .where(eq(transactions.id, transactionId))
    .run();
  if (lines) {
    replaceLines(tx, transactionId, lines);
    const principal = lines.find((line) => line.transferAccountId);
    if (principal?.transferAccountId) {
      const current = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
      if (current) {
        attachTransfer(tx, transactionId, {
          accountId: current.accountId,
          date: current.date,
          amount: current.amount,
          merchantId: current.merchantId,
          notes: current.notes,
          payeeRaw: current.payeeRaw,
          payeeNormalized: current.payeeNormalized,
          status: current.status === "cleared" ? current.status : "open",
        }, current.source, principal, false);
      }
    }
  } else if (plan.categoryId) {
    const line = tx.select().from(transactionLines).where(eq(transactionLines.transactionId, transactionId)).all();
    if (line.length === 1 && line[0] && line[0].transferAccountId === null) {
      tx.update(transactionLines).set({ categoryId: plan.categoryId }).where(eq(transactionLines.id, line[0].id)).run();
    }
  }
  auditTransaction(tx, transactionId, "label", before, readTransaction(tx, transactionId));
}

export function linkRecurring(tx: WriteTx, planId: string, dueDate: string, transactionId: string): void {
  const taken = tx.select({ id: occurrenceLinks.id }).from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, transactionId)).get();
  if (taken) {
    return;
  }
  const id = crypto.randomUUID();
  const row = { id, planId, dueDate, transactionId, skipped: false, reason: null };
  tx.insert(occurrenceLinks).values(row).run();
  tx.audit({
    entity: "occurrence_links",
    entityId: id,
    action: "link",
    before: null,
    after: { planId, dueDate, transactionId, skipped: false, reason: null },
  });
}

export function labelFields(result: MatchResult, merchantId: string | null) {
  if (result.level !== "automatic" || result.reason === null) {
    return null;
  }
  if (result.mortgage) {
    return {
      merchantId: merchantId ?? result.merchantId,
      autoReason: result.reason,
      autoSourceId: result.sourceId,
      autoConfidence: result.confidenceMilli,
    };
  }
  if (result.transferAccountId !== null || result.categoryId === null) {
    return null;
  }
  return {
    merchantId: merchantId ?? result.merchantId,
    categoryId: result.categoryId,
    autoReason: result.reason,
    autoSourceId: result.sourceId,
    autoConfidence: result.confidenceMilli,
  };
}

function applyRow(tx: WriteTx, row: OpenRow, result: MatchResult): void {
  const label = labelFields(result, row.merchantId);
  if (!label || !("categoryId" in label) || !label.categoryId) {
    return;
  }
  const before = readTransaction(tx, row.id);
  tx.update(transactions)
    .set({
      merchantId: label.merchantId,
      autoReason: label.autoReason,
      autoSourceId: label.autoSourceId,
      autoConfidence: label.autoConfidence,
    })
    .where(eq(transactions.id, row.id))
    .run();
  tx.update(transactionLines).set({ categoryId: label.categoryId }).where(eq(transactionLines.id, row.lineId)).run();
  auditTransaction(tx, row.id, "label", before, readTransaction(tx, row.id));
  linkRefundIfSure(tx, row.id);
}

/** Automatic labels that a confirmation scores again (decision 0043). */
const learnedReasons = ["learned_amount", "learned_payee"] as const;

/** Rows of these payees with one line and no transfer: uncategorized, or labelled by a learned signal. */
function openRows(tx: WriteTx, payees: string[]) {
  return tx
    .select({
      id: transactions.id,
      amount: transactions.amount,
      payee: transactions.payeeNormalized,
      merchantId: transactions.merchantId,
      autoReason: transactions.autoReason,
      autoSourceId: transactions.autoSourceId,
      autoConfidence: transactions.autoConfidence,
      lineId: transactionLines.id,
      categoryId: transactionLines.categoryId,
    })
    .from(transactions)
    .innerJoin(transactionLines, eq(transactionLines.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.mirror, literal(0)),
        inArray(transactions.payeeNormalized, payees),
        or(isNull(transactionLines.categoryId), inArray(transactions.autoReason, learnedReasons)),
        isNull(transactionLines.transferAccountId),
        isOnlyLine,
      ),
    )
    .all();
}

/** The same label keeps its category with the new values. A result that is not automatic removes the category. */
function rescoreRow(tx: WriteTx, row: OpenRow, result: MatchResult): void {
  const fields = labelFields(result, row.merchantId);
  const label = fields && "categoryId" in fields ? fields : null;
  if (label && label.categoryId !== row.categoryId) {
    applyRow(tx, row, result);
    return;
  }
  const auto = label
    ? { autoReason: label.autoReason, autoSourceId: label.autoSourceId, autoConfidence: label.autoConfidence }
    : { autoReason: null, autoSourceId: null, autoConfidence: null };
  if (
    label &&
    auto.autoReason === row.autoReason &&
    auto.autoSourceId === row.autoSourceId &&
    auto.autoConfidence === row.autoConfidence
  ) {
    return;
  }
  const before = readTransaction(tx, row.id);
  tx.update(transactions).set(auto).where(eq(transactions.id, row.id)).run();
  if (!label) {
    tx.update(transactionLines).set({ categoryId: null }).where(eq(transactionLines.id, row.lineId)).run();
  }
  auditTransaction(tx, row.id, "label", before, readTransaction(tx, row.id));
}

/**
 * Labels uncategorized rows for these payees, and scores again their automatic labels from learning (decision 0043).
 * Confirmed rows and other automatic reasons do not change.
 */
export function spreadSureLabels(tx: WriteTx, payees: readonly string[], except: ReadonlySet<string>): void {
  const wanted = new Set(payees.filter((payee) => payee.length > 0));
  if (wanted.size === 0) {
    return;
  }
  const book = loadMatchBook(tx);
  const rows = openRows(tx, [...wanted]).filter((row) => !except.has(row.id));
  for (const row of rows) {
    const result = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
    if (row.categoryId !== null) {
      rescoreRow(tx, row, result);
    } else if (result.level === "automatic") {
      applyRow(tx, row, result);
    }
  }
}
