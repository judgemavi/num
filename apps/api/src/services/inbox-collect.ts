import { createHash } from "node:crypto";
import { accounts, importBatches, importRows, settings, transactions } from "@num/db";
import { Temporal, unreadableRowSchema, type InboxItem } from "@num/shared";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { listOverspent } from "./buckets";
import { listFundingPaychecks } from "./funding-book";
import { uncategorizedItems } from "./inbox-uncategorized";
import { recurringSignals } from "./recurring-view";
import { listPromotionCandidates, listTransferPairs } from "./suggestions";

type TxnRef = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  payeeRaw: string;
};

const txnColumns = {
  id: transactions.id,
  accountId: transactions.accountId,
  date: transactions.date,
  amount: transactions.amount,
  payeeRaw: transactions.payeeRaw,
};

function settingNumber(db: Db, key: "staleImportDays" | "promoteAfter" | "recurringGraceDays", fallback: number): number {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  const value = Number(row?.value ?? String(fallback));
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function loadTxns(db: Db, ids: readonly string[]): Map<string, TxnRef> {
  const found = new Map<string, TxnRef>();
  for (const group of chunks([...new Set(ids)], 400)) {
    if (group.length === 0) {
      continue;
    }
    const rows = db
      .select(txnColumns)
      .from(transactions)
      .where(and(inArray(transactions.id, group), isNull(transactions.deletedAt)))
      .all();
    for (const row of rows) {
      found.set(row.id, row);
    }
  }
  return found;
}

function shiftDate(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

function reviewItems(db: Db): InboxItem[] {
  const rows = db
    .select({
      id: importRows.id,
      accountId: importRows.accountId,
      date: importRows.date,
      amount: importRows.amount,
      payeeRaw: importRows.payeeRaw,
    })
    .from(importRows)
    .innerJoin(importBatches, eq(importBatches.id, importRows.batchId))
    .where(and(eq(importRows.outcome, "needs_review"), eq(importRows.active, true), isNull(importBatches.undoneAt)))
    .all();
  if (rows.length === 0) {
    return [];
  }
  let minDate = rows[0]?.date ?? "";
  let maxDate = minDate;
  const accountIds = new Set<string>();
  for (const row of rows) {
    accountIds.add(row.accountId);
    if (row.date < minDate) {
      minDate = row.date;
    }
    if (row.date > maxDate) {
      maxDate = row.date;
    }
  }
  const pool = db
    .select(txnColumns)
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, [...accountIds]),
        isNull(transactions.deletedAt),
        isNull(transactions.importRowId),
        gte(transactions.date, shiftDate(minDate, -3)),
        lte(transactions.date, shiftDate(maxDate, 3)),
      ),
    )
    .all();
  return rows.map((row) => {
    const start = shiftDate(row.date, -3);
    const end = shiftDate(row.date, 3);
    const candidates = pool
      .filter((item) => item.accountId === row.accountId && item.amount === row.amount && item.date >= start && item.date <= end)
      .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.id < right.id ? -1 : 1));
    return {
      kind: "import_review" as const,
      itemKey: `import_review:${row.id}`,
      date: row.date,
      importRowId: row.id,
      accountId: row.accountId,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      candidates,
    };
  });
}

function recurringItems(db: Db, asOf: string): InboxItem[] {
  const signals = recurringSignals(db, asOf);
  const ids = [
    ...signals.ambiguous.flatMap((item) => item.transactionIds),
  ];
  const txns = loadTxns(db, ids);
  const items: InboxItem[] = [];
  for (const item of signals.changed) {
    items.push({
      kind: "recurring_changed",
      itemKey: `recurring_changed:${item.planId}:${item.dueDate}`,
      date: item.dueDate,
      planId: item.planId,
      dueDate: item.dueDate,
      transactionId: item.transactionId,
      expectedAmount: item.expectedAmount,
      actualAmount: item.actualAmount,
    });
  }
  for (const item of signals.missed) {
    items.push({
      kind: "recurring_missed",
      itemKey: `recurring_missed:${item.planId}:${item.dueDate}`,
      date: item.dueDate,
      planId: item.planId,
      dueDate: item.dueDate,
    });
  }
  for (const item of signals.ambiguous) {
    items.push({
      kind: "recurring_ambiguous",
      itemKey: `recurring_ambiguous:${item.planId}:${item.dueDate}`,
      date: item.dueDate,
      planId: item.planId,
      dueDate: item.dueDate,
      transactions: item.transactionIds.flatMap((id) => {
        const txn = txns.get(id);
        return txn ? [txn] : [];
      }),
    });
  }
  for (const item of signals.proposals) {
    items.push({
      kind: "plan_proposal",
      itemKey: `plan_proposal:${item.accountId}:${item.merchantId}:${item.startDate}:${item.freq}:${item.interval}`,
      date: item.startDate,
      ...item,
    });
  }
  return items;
}

function transferItems(db: Db, asOf: string): InboxItem[] {
  const pairs = listTransferPairs(db, asOf).items;
  const txns = loadTxns(
    db,
    pairs.flatMap((pair) => [pair.leftId, pair.rightId]),
  );
  const items: InboxItem[] = [];
  for (const pair of pairs) {
    const left = txns.get(pair.leftId);
    const right = txns.get(pair.rightId);
    if (!left || !right) {
      continue;
    }
    const [first, second] = left.id < right.id ? [left, right] : [right, left];
    items.push({
      kind: "transfer_pair",
      itemKey: `transfer_pair:${first.id}:${second.id}`,
      date: left.date > right.date ? left.date : right.date,
      left: first,
      right: second,
    });
  }
  return items;
}

function promotionItems(db: Db): InboxItem[] {
  return listPromotionCandidates(db).items.map((item) => {
    const digest = createHash("sha256").update(item.payee).digest("hex").slice(0, 32);
    return {
      kind: "promote_rule" as const,
      itemKey: `promote_rule:${item.merchantId}:${item.categoryId ?? item.transferAccountId}:${digest}`,
      date: null,
      payee: item.payee,
      merchantId: item.merchantId,
      categoryId: item.categoryId,
      transferAccountId: item.transferAccountId,
      count: item.count,
    };
  });
}

function overspentItems(db: Db, asOf: string): InboxItem[] {
  return listOverspent(db).items.map((item) => ({
    kind: "bucket_overspent" as const,
    itemKey: `bucket_overspent:${item.id}:${asOf.slice(0, 7)}`,
    date: asOf,
    bucketId: item.id,
    balance: item.balance,
  }));
}

function paycheckItems(db: Db): InboxItem[] {
  return listFundingPaychecks(db).items.map((item) => ({
    kind: "paycheck_funding" as const,
    itemKey: `paycheck_funding:${item.incomeTransactionId}`,
    date: item.date,
    incomeTransactionId: item.incomeTransactionId,
    dueDate: item.dueDate,
    amount: item.amount,
    payee: item.payee,
  }));
}

function unreadableItems(db: Db): InboxItem[] {
  const batches = db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      periodEnd: importBatches.periodEnd,
      unreadableJson: importBatches.unreadableJson,
    })
    .from(importBatches)
    .where(and(isNull(importBatches.undoneAt), sql`${importBatches.unreadableJson} <> '[]'`))
    .all();
  const items: InboxItem[] = [];
  for (const batch of batches) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(batch.unreadableJson);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) {
      continue;
    }
    for (const entry of parsed) {
      const row = unreadableRowSchema.safeParse(entry);
      if (!row.success) {
        continue;
      }
      items.push({
        kind: "import_unreadable",
        itemKey: `import_unreadable:${batch.id}:${row.data.line}`,
        date: batch.periodEnd,
        batchId: batch.id,
        accountId: batch.accountId,
        line: row.data.line,
        raw: row.data.raw,
        reason: row.data.reason,
      });
    }
  }
  return items;
}

function importFreshness(db: Db): { accountId: string; lastImportAt: string | null }[] {
  const open = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(isNull(accounts.archivedAt))
    .all();
  const batches = db
    .select({ accountId: importBatches.accountId, createdAt: importBatches.createdAt })
    .from(importBatches)
    .where(isNull(importBatches.undoneAt))
    .all();
  const latest = new Map<string, string>();
  for (const batch of batches) {
    const current = latest.get(batch.accountId);
    if (!current || current < batch.createdAt) {
      latest.set(batch.accountId, batch.createdAt);
    }
  }
  return open.map((account) => ({
    accountId: account.id,
    lastImportAt: latest.get(account.id) ?? null,
  }));
}

export function collectInbox(db: Db, asOf: string): {
  items: InboxItem[];
  imports: { accountId: string; lastImportAt: string | null }[];
  staleImportDays: number;
} {
  const items = [
    ...reviewItems(db),
    ...uncategorizedItems(db),
    ...recurringItems(db, asOf),
    ...transferItems(db, asOf),
    ...promotionItems(db),
    ...overspentItems(db, asOf),
    ...paycheckItems(db),
    ...unreadableItems(db),
  ];
  return {
    items,
    imports: importFreshness(db),
    staleImportDays: settingNumber(db, "staleImportDays", 10),
  };
}
