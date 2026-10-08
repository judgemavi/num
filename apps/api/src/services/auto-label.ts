import { rules, transactionLines, transactions } from "@num/db";
import { automaticLabel, type HistoryRow } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import { toRule } from "./rules";
import { auditTransaction, readTransaction } from "./transaction-record";
import type { WriteTx } from "./write";

type OpenRow = {
  id: string;
  accountId: string;
  payeeRaw: string;
  lineId: string;
};

export function loadConfirmations(db: { all<T>(query: ReturnType<typeof sql>): T[] }, payee: string): HistoryRow[] {
  if (payee.length === 0) {
    return [];
  }
  return db.all<HistoryRow>(sql`
    select
      t.id as id,
      t.date as date,
      t.payee_raw as payeeRaw,
      t.merchant_id as merchantId,
      l.category_id as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.deleted_at is null
      and t.mirror = 0
      and t.auto_reason is null
      and t.payee_normalized = ${payee}
      and l.category_id is not null
      and l.transfer_account_id is null
      and (select count(*) from transaction_lines x where x.transaction_id = t.id) = 1
    order by t.date desc, t.id desc
    limit 10
  `);
}

/** Sets a sure label on this payee's other uncategorized single-line transactions. */
export function spreadSureLabels(tx: WriteTx, payee: string, except: ReadonlySet<string>): void {
  if (payee.length === 0) {
    return;
  }
  const rows = tx.all<OpenRow>(sql`
    select t.id as id, t.account_id as accountId, t.payee_raw as payeeRaw, l.id as lineId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.deleted_at is null
      and t.mirror = 0
      and t.payee_normalized = ${payee}
      and l.category_id is null
      and l.transfer_account_id is null
      and (select count(*) from transaction_lines x where x.transaction_id = t.id) = 1
    order by t.date, t.id
  `).filter((row) => !except.has(row.id));
  if (rows.length === 0) {
    return;
  }
  const patterns = tx.select().from(rules).all().map((row) => toRule(row));
  const confirmations = loadConfirmations(tx, payee).flatMap((row) =>
    row.categoryId === null ? [] : [{ id: row.id, date: row.date, categoryId: row.categoryId, merchantId: row.merchantId }],
  );
  for (const row of rows) {
    const label = automaticLabel({
      accountId: row.accountId,
      rawPayee: row.payeeRaw,
      rules: patterns,
      confirmations,
    });
    if (!label) {
      continue;
    }
    const before = readTransaction(tx, row.id);
    tx.update(transactions)
      .set({ merchantId: label.merchantId, autoReason: label.reason, autoSourceId: label.sourceId })
      .where(eq(transactions.id, row.id))
      .run();
    tx.update(transactionLines).set({ categoryId: label.categoryId }).where(eq(transactionLines.id, row.lineId)).run();
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
  }
}
