import { merchants, rules } from "@num/db";
import {
  alternateSuggestion,
  suggestCategorization,
  uncategorizedLineKey,
  type HistoryRow,
  type InboxItem,
  type Suggestion,
} from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { loadConfirmations } from "./auto-label";
import { toRule } from "./rules";

type Row = {
  transactionId: string;
  lineId: string;
  accountId: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payee: string;
};

function historyFor(db: Db, payees: readonly string[]): Map<string, HistoryRow[]> {
  const grouped = new Map<string, HistoryRow[]>();
  for (const payee of payees) {
    grouped.set(payee, loadConfirmations(db, payee));
  }
  return grouped;
}

function toItem(
  row: Row,
  suggestion: Suggestion,
  context: { rules: ReturnType<typeof toRule>[]; history: HistoryRow[]; merchants: Parameters<typeof alternateSuggestion>[0]["merchants"] },
): InboxItem {
  return {
    kind: "uncategorized",
    itemKey: uncategorizedLineKey(row.lineId),
    date: row.date,
    accountId: row.accountId,
    transactionId: row.transactionId,
    lineId: row.lineId,
    amount: row.amount,
    payee: row.payee,
    payeeRaw: row.payeeRaw,
    suggestion,
    next: alternateSuggestion({
      accountId: row.accountId,
      rawPayee: row.payeeRaw,
      rules: context.rules,
      history: context.history,
      merchants: context.merchants,
    }),
  };
}

export function uncategorizedInbox(db: Db, hidden: ReadonlySet<string>): InboxItem[] {
  const rows = db.all<Row>(sql`
    select
      t.id as transactionId,
      min(l.id) as lineId,
      t.account_id as accountId,
      t.date as date,
      t.amount as amount,
      t.payee_raw as payeeRaw,
      t.payee_normalized as payee
    from transaction_lines l
    inner join transactions t on t.id = l.transaction_id
    where l.category_id is null
      and l.transfer_account_id is null
      and t.deleted_at is null
    group by t.id
  `);
  if (rows.length === 0) {
    return [];
  }
  const payees = [...new Set(rows.map((row) => row.payee).filter((payee) => payee.length > 0))];
  const history = historyFor(db, payees);
  const ruleRows = db.select().from(rules).all().map((row) => toRule(row));
  const merchantRows = db
    .select({
      id: merchants.id,
      name: merchants.name,
      defaultCategoryId: merchants.defaultCategoryId,
      archivedAt: merchants.archivedAt,
    })
    .from(merchants)
    .all();
  const cache = new Map<string, Suggestion>();
  const items = rows.map((row) => {
    const cacheKey = `${row.accountId}\u0000${row.payee}`;
    let suggestion = cache.get(cacheKey);
    if (!suggestion) {
      suggestion = suggestCategorization({
        accountId: row.accountId,
        rawPayee: row.payeeRaw,
        rules: ruleRows,
        history: history.get(row.payee) ?? [],
        merchants: merchantRows,
      });
      cache.set(cacheKey, suggestion);
    }
    return toItem(row, suggestion, { rules: ruleRows, history: history.get(row.payee) ?? [], merchants: merchantRows });
  });
  return items.filter((item) => !hidden.has(item.itemKey));
}
