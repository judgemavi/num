import { accounts, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { utcNow, type MatchResult } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import { mortgageLinesFor } from "./mortgage-learned";
import { loadMatchBook, scorePayee } from "./match-book";
import { linkRefundIfSure } from "./refund-auto";
import { auditTransaction, readTransaction } from "./transaction-record";
import { replaceLines } from "./transaction-lines";
import { attachTransfer } from "./transaction-transfer";
import type { WriteTx } from "./write";

type OpenRow = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  payee: string;
  merchantId: string | null;
  lineId: string;
};

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
    lead: 1,
    reason: "recurring" as const,
    sourceId: plan.id,
    sourceName: plan.name,
    categoryId: mortgage ? null : plan.categoryId,
    merchantId: plan.merchantId,
    transferAccountId: mortgage ? plan.transferAccountId : null,
    learnedCount: null,
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

/** Labels uncategorized rows for these payees. */
export function spreadSureLabels(tx: WriteTx, payees: readonly string[], except: ReadonlySet<string>): void {
  const wanted = new Set(payees.filter((payee) => payee.length > 0));
  if (wanted.size === 0) {
    return;
  }
  const book = loadMatchBook(tx);
  const list = sql.join([...wanted].map((payee) => sql`${payee}`), sql`, `);
  const rows = tx.all<OpenRow>(sql`
    select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount,
      t.payee_normalized as payee, t.merchant_id as merchantId, l.id as lineId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where 1 = 1
      and t.mirror = 0
      and t.payee_normalized in (${list})
      and l.category_id is null
      and l.transfer_account_id is null
      and not exists (
        select 1 from transaction_lines extra
        where extra.transaction_id = t.id and extra.id <> l.id
      )
  `).filter((row) => !except.has(row.id));
  for (const row of rows) {
    const result = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
    if (result.level !== "automatic") {
      continue;
    }
    applyRow(tx, row, result);
  }
}
