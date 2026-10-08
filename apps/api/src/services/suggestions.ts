import { accounts, merchants, rules, settings, transactions } from "@num/db";
import {
  normalizePayee,
  ruleCoversPayee,
  suggestCategorization,
  Temporal,
  transferPairs,
  type HistoryRow,
  type Promotion,
  type RulePattern,
  type Suggestion,
  type TransferPair,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { createRule, toRule } from "./rules";
import { loadLines, replaceLines } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction } from "./transaction-record";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function promoteAfter(db: Db): number {
  const row = db.select().from(settings).where(eq(settings.key, "promoteAfter")).get();
  const value = Number(row?.value ?? "3");
  if (!Number.isInteger(value) || value < 1) {
    return 3;
  }
  return value;
}

function lastCategorized(db: Db, payee: string): HistoryRow[] {
  return db.all<HistoryRow>(sql`
    select
      t.id as id,
      t.date as date,
      t.payee_raw as payeeRaw,
      t.merchant_id as merchantId,
      min(l.category_id) as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.deleted_at is null
      and t.payee_normalized = ${payee}
      and l.category_id is not null
    group by t.id
    having count(distinct l.category_id) = 1
    order by t.date desc, t.id desc
    limit 10
  `);
}

function ruleRows(db: Db): RulePattern[] {
  return db.select().from(rules).all().map((row) => toRule(row));
}

export function suggestForPayee(db: Db, accountId: string, rawPayee: string): Suggestion {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const payee = normalizePayee(rawPayee);
  return suggestCategorization({
    accountId,
    rawPayee,
    rules: ruleRows(db),
    history: lastCategorized(db, payee),
    merchants: db.select().from(merchants).all(),
  });
}

export function listPromotionCandidates(db: Db): { items: Promotion[] } {
  const minimum = promoteAfter(db);
  const activeRules = ruleRows(db);
  const rows = promotionCounts(db, minimum);
  return {
    items: rows
      .filter((row) => !ruleCoversPayee(activeRules, row.payee))
      .sort((left, right) => right.count - left.count || (left.payee < right.payee ? -1 : 1)),
  };
}

function promotionCounts(db: Db, minimum: number): Promotion[] {
  const payees = db.all<{ payee: string }>(sql`
    select distinct payee_normalized as payee
    from transactions
    where deleted_at is null and mirror = 0 and merchant_id is not null and payee_normalized != ''
  `);
  const recent = (db as unknown as { $client: { prepare(query: string): { all(value: string): { id: string; merchantId: string }[] } } }).$client.prepare(`
    select id, merchant_id as merchantId
    from transactions
    where deleted_at is null and mirror = 0 and payee_normalized = ? and merchant_id is not null
    order by date desc, id desc
    limit 20
  `);
  const heads: { id: string; payee: string; merchantId: string }[] = [];
  const scanned = new Map<string, number>();
  for (const row of payees) {
    const found = recent.all(row.payee);
    scanned.set(row.payee, found.length);
    for (const head of found) {
      heads.push({ ...head, payee: row.payee });
    }
  }
  const lines = new Map<string, { categoryId: string | null; transferAccountId: string | null }[]>();
  for (let index = 0; index < heads.length; index += 400) {
    const group = heads.slice(index, index + 400);
    if (group.length === 0) {
      continue;
    }
    const list = sql.join(
      group.map((head) => sql`${head.id}`),
      sql`, `,
    );
    const found = db.all<{ transactionId: string; categoryId: string | null; transferAccountId: string | null }>(sql`
      select transaction_id as transactionId, category_id as categoryId, transfer_account_id as transferAccountId
      from transaction_lines
      where transaction_id in (${list})
    `);
    for (const line of found) {
      const current = lines.get(line.transactionId) ?? [];
      current.push({ categoryId: line.categoryId, transferAccountId: line.transferAccountId });
      lines.set(line.transactionId, current);
    }
  }
  const counts = new Map<string, Promotion>();
  const kept = new Map<string, number>();
  const seen = new Set<string>();
  for (const head of heads) {
    const count = kept.get(head.payee) ?? 0;
    if (count >= 10 || seen.has(head.id)) {
      continue;
    }
    seen.add(head.id);
    const rowLines = lines.get(head.id) ?? [];
    const categories = new Set(rowLines.map((line) => line.categoryId).filter((id): id is string => id !== null));
    const transfers = new Set(rowLines.map((line) => line.transferAccountId).filter((id): id is string => id !== null));
    const categoryId = categories.size === 1 && transfers.size === 0 ? ([...categories][0] ?? null) : null;
    const transferAccountId = transfers.size === 1 && categories.size === 0 ? ([...transfers][0] ?? null) : null;
    if ((categoryId === null) === (transferAccountId === null)) {
      continue;
    }
    kept.set(head.payee, count + 1);
    const key = `${head.payee}\u0000${head.merchantId}\u0000${categoryId ?? ""}\u0000${transferAccountId ?? ""}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { payee: head.payee, merchantId: head.merchantId, categoryId, transferAccountId, count: 1 });
    }
  }
  for (const [payee, total] of scanned) {
    if (total < 20 || (kept.get(payee) ?? 0) >= 10) {
      continue;
    }
    for (const key of [...counts.keys()]) {
      if (counts.get(key)?.payee === payee) {
        counts.delete(key);
      }
    }
    for (const row of exactPromotion(db, payee)) {
      counts.set(`${row.payee}\u0000${row.merchantId}\u0000${row.categoryId ?? ""}\u0000${row.transferAccountId ?? ""}`, row);
    }
  }
  return [...counts.values()].filter((row) => row.count >= minimum);
}

function exactPromotion(db: Db, payee: string): Promotion[] {
  const categories = db.all<Promotion>(sql`
    with categorized as (
      select
        t.id as id,
        t.merchant_id as merchantId,
        min(l.category_id) as categoryId
      from transactions t
      inner join transaction_lines l on l.transaction_id = t.id
      where t.deleted_at is null
        and t.mirror = 0
        and t.payee_normalized = ${payee}
        and t.merchant_id is not null
        and l.category_id is not null
        and l.transfer_account_id is null
      group by t.id
      having count(distinct l.category_id) = 1
      order by t.date desc, t.id desc
      limit 10
    )
    select ${payee} as payee, merchantId, categoryId, null as transferAccountId, count(*) as count
    from categorized
    group by merchantId, categoryId
  `);
  const transfers = db.all<Promotion>(sql`
    with linked as (
      select
        t.id as id,
        t.merchant_id as merchantId,
        min(l.transfer_account_id) as transferAccountId
      from transactions t
      inner join transaction_lines l on l.transaction_id = t.id
      where t.deleted_at is null
        and t.mirror = 0
        and t.payee_normalized = ${payee}
        and t.merchant_id is not null
        and l.transfer_account_id is not null
        and l.category_id is null
      group by t.id
      having count(distinct l.transfer_account_id) = 1
      order by t.date desc, t.id desc
      limit 10
    )
    select ${payee} as payee, merchantId, null as categoryId, transferAccountId, count(*) as count
    from linked
    group by merchantId, transferAccountId
  `);
  return [...categories, ...transfers].map((row) => ({ ...row, count: Number(row.count) }));
}

export function listTransferPairs(db: Db, asOf: string): { items: TransferPair[] } {
  const start = Temporal.PlainDate.from(asOf).subtract({ days: 90 }).toString();
  const rows = db.all<{ id: string; accountId: string; date: string; amount: number }>(sql`
    select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount
    from transactions t
    inner join accounts a on a.id = t.account_id
    where t.deleted_at is null
      and t.transfer_peer_id is null
      and a.on_budget = 1
      and t.amount != 0
      and t.date >= ${start}
      and t.date <= ${asOf}
    order by abs(t.amount), t.date, t.id
  `);
  return {
    items: transferPairs(
      rows.map((row) => ({ ...row, onBudget: true, linked: false })),
      asOf,
    ),
  };
}

export function promotePayee(
  db: Db,
  input: { payee: string; merchantId: string; categoryId?: string | null; transferAccountId?: string | null } & WriteInput,
) {
  const payee = normalizePayee(input.payee);
  const categoryId = input.categoryId ?? null;
  const transferAccountId = input.transferAccountId ?? null;
  if ((categoryId === null) === (transferAccountId === null)) {
    throw new ServiceError("promotion_not_ready", 409);
  }
  const ready = listPromotionCandidates(db).items.some(
    (item) =>
      item.payee === payee &&
      item.merchantId === input.merchantId &&
      item.categoryId === categoryId &&
      item.transferAccountId === transferAccountId,
  );
  if (!ready) {
    throw new ServiceError("promotion_not_ready", 409);
  }
  return createRule(db, {
    match: "exact",
    pattern: payee,
    merchantId: input.merchantId,
    categoryId,
    transferAccountId,
    priority: 0,
    origin: "promoted",
    source: input.source,
    at: input.at,
  });
}

export function acceptTransferPair(db: Db, asOf: string, leftId: string, rightId: string, input: WriteInput) {
  const ready = listTransferPairs(db, asOf).items.some(
    (pair) =>
      (pair.leftId === leftId && pair.rightId === rightId) || (pair.leftId === rightId && pair.rightId === leftId),
  );
  if (!ready) {
    throw new ServiceError("transfer_pair_not_found", 404);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    const left = tx.select().from(transactions).where(eq(transactions.id, leftId)).get();
    const right = tx.select().from(transactions).where(eq(transactions.id, rightId)).get();
    if (!left || !right || left.deletedAt || right.deletedAt || left.accountId === right.accountId) {
      throw new ServiceError("transfer_pair_not_found", 404);
    }
    if (left.transferPeerId || right.transferPeerId) {
      throw new ServiceError("transfer_pair_not_found", 404);
    }
    if (left.status === "reconciled" || right.status === "reconciled") {
      throw new ServiceError("transaction_reconciled", 409);
    }
    const leftLines = loadLines(tx, left.id);
    const rightLines = loadLines(tx, right.id);
    const leftBefore = toTransaction(left, leftLines);
    const rightBefore = toTransaction(right, rightLines);
    tx.update(transactions).set({ transferPeerId: right.id }).where(eq(transactions.id, left.id)).run();
    tx.update(transactions).set({ transferPeerId: left.id }).where(eq(transactions.id, right.id)).run();
    replaceLines(tx, left.id, [
      {
        amount: left.amount,
        memo: leftLines.length === 1 ? (leftLines[0]?.memo ?? null) : null,
        categoryId: null,
        transferAccountId: right.accountId,
        tagIds: [...new Set(leftLines.flatMap((line) => line.tagIds))],
      },
    ]);
    replaceLines(tx, right.id, [
      {
        amount: right.amount,
        memo: rightLines.length === 1 ? (rightLines[0]?.memo ?? null) : null,
        categoryId: null,
        transferAccountId: left.accountId,
        tagIds: [...new Set(rightLines.flatMap((line) => line.tagIds))],
      },
    ]);
    auditTransaction(tx, left.id, "update", leftBefore, readTransaction(tx, left.id));
    auditTransaction(tx, right.id, "update", rightBefore, readTransaction(tx, right.id));
  });
  return { leftId, rightId };
}
