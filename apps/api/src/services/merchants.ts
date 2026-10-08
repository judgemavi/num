import { categories, merchants } from "@num/db";
import {
  utcNow,
  type Merchant,
  type MerchantCreate,
  type MerchantListQuery,
  type MerchantUpdate,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type MerchantRow = typeof merchants.$inferSelect;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareName(left: string, right: string): number {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  return folded === 0 ? compareText(left, right) : folded;
}

function snapshot(row: { name: string; defaultCategoryId: string | null; archivedAt: string | null }) {
  return {
    name: row.name,
    defaultCategoryId: row.defaultCategoryId,
    archivedAt: row.archivedAt,
  };
}

export function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    name: row.name,
    defaultCategoryId: row.defaultCategoryId,
    archivedAt: row.archivedAt,
  };
}

function assertName(tx: WriteTx, name: string, exceptId?: string) {
  const row = tx
    .select({ id: merchants.id })
    .from(merchants)
    .where(sql`lower(${merchants.name}) = lower(${name})`)
    .get();
  if (row && row.id !== exceptId) {
    throw new ServiceError("merchant_name_taken", 409);
  }
}

export function assertActiveCategory(tx: WriteTx, id: string | null) {
  if (id === null) {
    return;
  }
  const row = tx.select({ archivedAt: categories.archivedAt }).from(categories).where(eq(categories.id, id)).get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("category_archived", 409);
  }
}

export function getMerchant(db: Db, id: string): Merchant {
  const row = db.select().from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  return toMerchant(row);
}

export function listMerchants(db: Db, query: MerchantListQuery) {
  const rows = db
    .select()
    .from(merchants)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .map(toMerchant);
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => compareName(left.name, right.name) * dir || compareText(left.id, right.id));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
  };
}

export function createMerchant(db: Db, input: MerchantCreate & WriteInput): Merchant {
  const id = crypto.randomUUID();
  const row = {
    id,
    name: input.name.trim(),
    defaultCategoryId: input.defaultCategoryId ?? null,
    archivedAt: null,
  };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertName(tx, row.name);
    assertActiveCategory(tx, row.defaultCategoryId);
    tx.insert(merchants).values(row).run();
    tx.audit({ entity: "merchants", entityId: id, action: "create", before: null, after: snapshot(row) });
  });
  return toMerchant(row);
}

export function updateMerchant(db: Db, id: string, input: MerchantUpdate & WriteInput): Merchant {
  let updated: Merchant | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    const next = {
      name: input.name.trim(),
      defaultCategoryId: input.defaultCategoryId,
      archivedAt: existing.archivedAt,
    };
    assertName(tx, next.name, id);
    assertActiveCategory(tx, next.defaultCategoryId);
    tx.update(merchants).set({ name: next.name, defaultCategoryId: next.defaultCategoryId }).where(eq(merchants.id, id)).run();
    tx.audit({
      entity: "merchants",
      entityId: id,
      action: "update",
      before: snapshot(existing),
      after: snapshot(next),
    });
    updated = toMerchant({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a merchant");
  }
  return updated;
}

export function archiveMerchant(db: Db, id: string, input: WriteInput): Merchant {
  const at = input.at ?? utcNow();
  let archived: Merchant | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("merchant_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(merchants).set({ archivedAt: at }).where(eq(merchants.id, id)).run();
    tx.audit({ entity: "merchants", entityId: id, action: "archive", before: snapshot(existing), after: snapshot(next) });
    archived = toMerchant(next);
  });
  if (!archived) {
    throw new Error("Archive did not return a merchant");
  }
  return archived;
}

export function restoreMerchant(db: Db, id: string, input: WriteInput): Merchant {
  let restored: Merchant | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("merchant_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(merchants).set({ archivedAt: null }).where(eq(merchants.id, id)).run();
    tx.audit({ entity: "merchants", entityId: id, action: "restore", before: snapshot(existing), after: snapshot(next) });
    restored = toMerchant(next);
  });
  if (!restored) {
    throw new Error("Restore did not return a merchant");
  }
  return restored;
}
