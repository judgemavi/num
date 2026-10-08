import { accounts, merchants, rules, settings } from "@num/db";
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
import type { AuditSource } from "./write";

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
  const rows = db.all<Promotion>(sql`
    with categorized as (
      select
        t.id as id,
        t.payee_normalized as payee,
        t.merchant_id as merchantId,
        t.date as date,
        min(l.category_id) as categoryId
      from transactions t
      inner join transaction_lines l on l.transaction_id = t.id
      where t.deleted_at is null
        and t.merchant_id is not null
        and l.category_id is not null
      group by t.id
      having count(distinct l.category_id) = 1
    ),
    ranked as (
      select
        payee,
        merchantId,
        categoryId,
        row_number() over (partition by payee order by date desc, id desc) as rn
      from categorized
    )
    select payee, merchantId, categoryId, count(*) as count
    from ranked
    where rn <= 10
    group by payee, merchantId, categoryId
    having count(*) >= ${minimum}
  `);
  return {
    items: rows
      .map((row) => ({ ...row, count: Number(row.count) }))
      .filter((row) => !ruleCoversPayee(activeRules, row.payee))
      .sort((left, right) => right.count - left.count || (left.payee < right.payee ? -1 : 1)),
  };
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
  input: { payee: string; merchantId: string; categoryId: string } & WriteInput,
) {
  const payee = normalizePayee(input.payee);
  const ready = listPromotionCandidates(db).items.some(
    (item) => item.payee === payee && item.merchantId === input.merchantId && item.categoryId === input.categoryId,
  );
  if (!ready) {
    throw new ServiceError("promotion_not_ready", 409);
  }
  return createRule(db, {
    match: "exact",
    pattern: payee,
    merchantId: input.merchantId,
    categoryId: input.categoryId,
    priority: 0,
    origin: "promoted",
    source: input.source,
    at: input.at,
  });
}
