import { accounts, mortgageTerms, occurrenceLinks, transactionLines, transactions, valuations } from "@num/db";
import { mortgagePrefillLines, mortgageSplitForDate, similarPayees, utcNow, type Compounding, type MatchResult, type PaymentFrequency } from "@num/shared";
import { and, eq, sql } from "drizzle-orm";
import { loadMatchBook, scorePayee } from "./match-book";
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
  const terms = tx.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, result.transferAccountId)).get();
  if (!terms || terms.paymentAccountId !== fromAccountId) {
    return null;
  }
  const history = tx
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(and(eq(valuations.accountId, result.transferAccountId)))
    .all();
  const split = mortgageSplitForDate({
    terms: {
      ...terms,
      compounding: terms.compounding as Compounding,
      paymentFrequency: terms.paymentFrequency as PaymentFrequency,
    },
    valuations: history,
    date,
    fromAccountId,
    toAccountId: result.transferAccountId,
  });
  if (!split) {
    return null;
  }
  const fitted = mortgagePrefillLines(split.interest, split.principal, Math.abs(amount));
  const sign = amount < 0 ? -1 : 1;
  return [
    {
      amount: sign * fitted.interest,
      memo: null,
      categoryId: split.interestCategoryId,
      transferAccountId: null,
      tagIds: [] as string[],
    },
    {
      amount: sign * fitted.principal,
      memo: null,
      categoryId: null,
      transferAccountId: result.transferAccountId,
      tagIds: [] as string[],
    },
  ];
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
    alternate: null,
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
}

/** Labels uncategorized rows for these payees, and for payees similar to them. */
export function spreadSureLabels(tx: WriteTx, payees: readonly string[], except: ReadonlySet<string>): void {
  const seeds = [...new Set(payees.filter((payee) => payee.length > 0))];
  if (seeds.length === 0) {
    return;
  }
  const book = loadMatchBook(tx);
  const wanted = new Set<string>();
  for (const payee of seeds) {
    wanted.add(payee);
    let similar = book.similarByPayee.get(payee);
    if (!similar) {
      similar = similarPayees(book.index, payee).map((hit) => ({
        payee: hit.payee,
        similarity: hit.similarity,
        scores: book.payeeLearned.get(hit.payee) ?? [],
      }));
      book.similarByPayee.set(payee, similar);
    }
    for (const hit of similar) {
      wanted.add(hit.payee);
    }
  }
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
