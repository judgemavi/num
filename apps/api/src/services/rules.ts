import { accounts, merchants, rules } from "@num/db";
import {
  utcNow,
  validRulePattern,
  type Rule,
  type RuleCreate,
  type RuleListQuery,
  type RuleMatch,
  type RuleOrigin,
  type RuleUpdate,
} from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { assertActiveCategory } from "./merchants";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type RuleRow = typeof rules.$inferSelect;

export type RuleInput = {
  match: RuleMatch;
  pattern: string;
  accountId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  transferAccountId?: string | null;
  priority: number;
  origin?: RuleOrigin;
};

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function snapshot(row: {
  match: string;
  pattern: string;
  accountId: string | null;
  merchantId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  priority: number;
  origin: string;
  archivedAt: string | null;
}) {
  return {
    match: row.match,
    pattern: row.pattern,
    accountId: row.accountId,
    merchantId: row.merchantId,
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    priority: row.priority,
    origin: row.origin,
    archivedAt: row.archivedAt,
  };
}

function asMatch(value: string): RuleMatch {
  if (value !== "exact" && value !== "prefix" && value !== "contains") {
    throw new Error("Unknown rule match");
  }
  return value;
}

function asOrigin(value: string): RuleOrigin {
  if (value !== "manual" && value !== "promoted") {
    throw new Error("Unknown rule origin");
  }
  return value;
}

export function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    match: asMatch(row.match),
    pattern: row.pattern,
    accountId: row.accountId,
    merchantId: row.merchantId,
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    priority: row.priority,
    origin: asOrigin(row.origin),
    archivedAt: row.archivedAt,
  };
}

function assertPattern(match: RuleMatch, pattern: string) {
  if (!validRulePattern(match, pattern)) {
    throw new ServiceError("rule_pattern_invalid", 400);
  }
}

function assertAccount(tx: WriteTx, id: string | null) {
  if (id === null) {
    return;
  }
  const row = tx.select({ archivedAt: accounts.archivedAt }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("account_archived", 409);
  }
}

function assertMerchant(tx: WriteTx, id: string | null) {
  if (id === null) {
    return;
  }
  const row = tx.select({ archivedAt: merchants.archivedAt }).from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("merchant_archived", 409);
  }
}

function assertTarget(
  merchantId: string | null,
  categoryId: string | null,
  transferAccountId: string | null,
  accountId: string | null,
) {
  if (categoryId !== null && transferAccountId !== null) {
    throw new ServiceError("rule_targets_conflict", 400);
  }
  if (merchantId === null && categoryId === null && transferAccountId === null) {
    throw new ServiceError("rule_target_required", 400);
  }
  if (transferAccountId !== null && accountId !== null && transferAccountId === accountId) {
    throw new ServiceError("transfer_same_account", 400);
  }
}

export function listRules(db: Db, query: RuleListQuery) {
  const rows = db
    .select()
    .from(rules)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .map(toRule);
  const sort = query.sort ?? "priority";
  const dir = query.dir === "desc" ? -1 : query.dir === "asc" ? 1 : query.sort === undefined ? -1 : 1;
  rows.sort((left, right) => {
    const field =
      sort === "pattern"
        ? compareText(left.pattern.toLowerCase(), right.pattern.toLowerCase())
        : left.priority - right.priority;
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
  };
}

function fields(input: RuleInput, origin: RuleOrigin, archivedAt: string | null) {
  const merchantId = input.merchantId ?? null;
  const categoryId = input.categoryId ?? null;
  const transferAccountId = input.transferAccountId ?? null;
  const accountId = input.accountId ?? null;
  assertTarget(merchantId, categoryId, transferAccountId, accountId);
  assertPattern(input.match, input.pattern);
  return {
    match: input.match,
    pattern: input.pattern.trim(),
    accountId,
    merchantId,
    categoryId,
    transferAccountId,
    priority: input.priority,
    origin,
    archivedAt,
  };
}

export function createRule(db: Db, input: RuleCreate & WriteInput & { origin?: RuleOrigin }): Rule {
  const id = crypto.randomUUID();
  const row = { id, ...fields(input, input.origin ?? "manual", null) };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertAccount(tx, row.accountId);
    assertAccount(tx, row.transferAccountId);
    assertMerchant(tx, row.merchantId);
    assertActiveCategory(tx, row.categoryId);
    tx.insert(rules).values(row).run();
    tx.audit({ entity: "rules", entityId: id, action: "create", before: null, after: snapshot(row) });
  });
  return toRule(row);
}

export function updateRule(db: Db, id: string, input: RuleUpdate & WriteInput): Rule {
  let updated: Rule | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(rules).where(eq(rules.id, id)).get();
    if (!existing) {
      throw new ServiceError("rule_not_found", 404);
    }
    const next = fields({ ...input, origin: asOrigin(existing.origin) }, asOrigin(existing.origin), existing.archivedAt);
    assertAccount(tx, next.accountId);
    assertAccount(tx, next.transferAccountId);
    assertMerchant(tx, next.merchantId);
    assertActiveCategory(tx, next.categoryId);
    tx.update(rules)
      .set({
        match: next.match,
        pattern: next.pattern,
        accountId: next.accountId,
        merchantId: next.merchantId,
        categoryId: next.categoryId,
        transferAccountId: next.transferAccountId,
        priority: next.priority,
      })
      .where(eq(rules.id, id))
      .run();
    tx.audit({ entity: "rules", entityId: id, action: "update", before: snapshot(existing), after: snapshot(next) });
    updated = toRule({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a rule");
  }
  return updated;
}

export function archiveRule(db: Db, id: string, input: WriteInput): Rule {
  const at = input.at ?? utcNow();
  let archived: Rule | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(rules).where(eq(rules.id, id)).get();
    if (!existing) {
      throw new ServiceError("rule_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("rule_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(rules).set({ archivedAt: at }).where(eq(rules.id, id)).run();
    tx.audit({ entity: "rules", entityId: id, action: "archive", before: snapshot(existing), after: snapshot(next) });
    archived = toRule(next);
  });
  if (!archived) {
    throw new Error("Archive did not return a rule");
  }
  return archived;
}

export function restoreRule(db: Db, id: string, input: WriteInput): Rule {
  let restored: Rule | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(rules).where(eq(rules.id, id)).get();
    if (!existing) {
      throw new ServiceError("rule_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("rule_not_archived", 409);
    }
    assertAccount(tx, existing.accountId);
    assertMerchant(tx, existing.merchantId);
    assertActiveCategory(tx, existing.categoryId);
    const next = { ...existing, archivedAt: null };
    tx.update(rules).set({ archivedAt: null }).where(eq(rules.id, id)).run();
    tx.audit({ entity: "rules", entityId: id, action: "restore", before: snapshot(existing), after: snapshot(next) });
    restored = toRule(next);
  });
  if (!restored) {
    throw new Error("Restore did not return a rule");
  }
  return restored;
}

export function requireRule(tx: Db | WriteTx, id: string): RuleRow {
  const row = tx.select().from(rules).where(eq(rules.id, id)).get();
  if (!row) {
    throw new ServiceError("rule_not_found", 404);
  }
  return row;
}
