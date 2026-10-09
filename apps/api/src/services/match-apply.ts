import { mortgageTerms, occurrenceLinks, transactionLines, transactions, valuations } from "@num/db";
import { mortgagePrefillLines, mortgageSplitForDate, type Compounding, type MatchResult, type PaymentFrequency } from "@num/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { loadMatchBook, scorePayee } from "./match-book";
import { auditTransaction, readTransaction } from "./transaction-record";
import { replaceLines } from "./transaction-lines";
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
    .where(and(eq(valuations.accountId, result.transferAccountId), isNull(valuations.deletedAt)))
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

function applyRow(tx: WriteTx, row: OpenRow, result: MatchResult, dueDate: string | null): void {
  const mortgage = result.mortgage ? mortgageSplitLines(tx, result, row.accountId, row.date, row.amount) : null;
  const label = labelFields(result, row.merchantId);
  if (!label) {
    return;
  }
  if (result.mortgage && !mortgage) {
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
  if (mortgage) {
    replaceLines(tx, row.id, mortgage);
  } else if ("categoryId" in label && label.categoryId) {
    tx.update(transactionLines).set({ categoryId: label.categoryId }).where(eq(transactionLines.id, row.lineId)).run();
  }
  if (result.reason === "recurring" && result.sourceId && dueDate) {
    linkRecurring(tx, result.sourceId, dueDate, row.id);
  }
  auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
}

const openRows = sql`
  select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount,
    t.payee_normalized as payee, t.merchant_id as merchantId, l.id as lineId
  from transactions t
  inner join transaction_lines l on l.transaction_id = t.id
  where t.deleted_at is null
    and t.mirror = 0
    and l.category_id is null
    and l.transfer_account_id is null
    and t.id in (
      select transaction_id from transaction_lines group by transaction_id having count(*) = 1
    )
`;

/** Labels other uncategorized transactions that are now above the threshold. */
export function spreadSureLabels(tx: WriteTx, _payee: string, except: ReadonlySet<string>): void {
  const rows = tx.all<OpenRow>(openRows).filter((row) => !except.has(row.id));
  if (rows.length === 0) {
    return;
  }
  const book = loadMatchBook(tx);
  for (const row of rows) {
    const result = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
    if (result.level !== "automatic") {
      continue;
    }
    applyRow(tx, row, result, null);
  }
}
