import { accounts, merchants, rules, settings, transactionLines, transactions } from "@num/db";
import {
  normalizePayee,
  promotionCandidates,
  suggestCategorization,
  transferPairs,
  type HistoryRow,
  type Promotion,
  type RulePattern,
  type Suggestion,
  type TransferPair,
} from "@num/shared";
import { eq, isNull } from "drizzle-orm";
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

function categoryByTransaction(db: Db): Map<string, string | null> {
  const grouped = new Map<string, Set<string>>();
  for (const line of db.select().from(transactionLines).all()) {
    if (!line.categoryId) {
      continue;
    }
    const set = grouped.get(line.transactionId) ?? new Set<string>();
    set.add(line.categoryId);
    grouped.set(line.transactionId, set);
  }
  return new Map([...grouped].map(([id, set]) => [id, set.size === 1 ? ([...set][0] ?? null) : null]));
}

function historyRows(db: Db): HistoryRow[] {
  const categories = categoryByTransaction(db);
  return db
    .select()
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all()
    .map((row) => ({
      id: row.id,
      date: row.date,
      payeeRaw: row.payeeRaw,
      merchantId: row.merchantId,
      categoryId: categories.get(row.id) ?? null,
    }));
}

function ruleRows(db: Db): RulePattern[] {
  return db.select().from(rules).all().map((row) => toRule(row));
}

export function suggestForPayee(db: Db, accountId: string, rawPayee: string): Suggestion {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  return suggestCategorization({
    accountId,
    rawPayee,
    rules: ruleRows(db),
    history: historyRows(db),
    merchants: db.select().from(merchants).all(),
  });
}

export function listPromotionCandidates(db: Db): { items: Promotion[] } {
  const rows = historyRows(db).filter((row) => row.merchantId !== null && row.categoryId !== null);
  return { items: promotionCandidates(rows, ruleRows(db), promoteAfter(db)) };
}

export function listTransferPairs(db: Db): { items: TransferPair[] } {
  const rows = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      onBudget: accounts.onBudget,
      date: transactions.date,
      amount: transactions.amount,
      transferPeerId: transactions.transferPeerId,
      deletedAt: transactions.deletedAt,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .all();
  return {
    items: transferPairs(
      rows
        .filter((row) => row.deletedAt === null)
        .map((row) => ({
          id: row.id,
          accountId: row.accountId,
          onBudget: row.onBudget,
          date: row.date,
          amount: row.amount,
          linked: row.transferPeerId !== null,
        })),
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
