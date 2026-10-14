import { merchants } from "@num/db";
import {
  utcNow,
  type Merchant,
  type MerchantCreate,
  type MerchantListQuery,
  type MerchantUpdate,
} from "@num/shared";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";
import { compareText, pageOf } from "./paging";

function compareName(left: string, right: string) {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  return folded === 0 ? compareText(left, right) : folded;
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

export function getMerchant(db: Db, id: string): Merchant {
  const row = db.select().from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  return row;
}

export function listMerchants(db: Db, query: MerchantListQuery) {
  const rows = db
    .select()
    .from(merchants)
    .where(query.archived ? isNotNull(merchants.archivedAt) : isNull(merchants.archivedAt))
    .all();
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => compareName(left.name, right.name) * dir || compareText(left.id, right.id));
  return pageOf(rows, query);
}

export function createMerchant(db: Db, input: MerchantCreate & WriteInput): Merchant {
  const id = crypto.randomUUID();
  const row = {
    id,
    name: input.name.trim(),
    archivedAt: null,
  };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertName(tx, row.name);
    tx.insert(merchants).values(row).run();
    tx.audit({ entity: "merchants", entityId: id, action: "create", before: null, after: withoutId(row) });
  });
  return row;
}

export function updateMerchant(db: Db, id: string, input: MerchantUpdate & WriteInput): Merchant {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    const next = {
      name: input.name.trim(),
      archivedAt: existing.archivedAt,
    };
    assertName(tx, next.name, id);
    tx.update(merchants).set({ name: next.name }).where(eq(merchants.id, id)).run();
    tx.audit({
      entity: "merchants",
      entityId: id,
      action: "update",
      before: withoutId(existing),
      after: next,
    });
    return { id, ...next };
  });
}

export function archiveMerchant(db: Db, id: string, input: WriteInput): Merchant {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("merchant_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(merchants).set({ archivedAt: at }).where(eq(merchants.id, id)).run();
    tx.audit({ entity: "merchants", entityId: id, action: "archive", before: withoutId(existing), after: withoutId(next) });
    return next;
  });
}

export function restoreMerchant(db: Db, id: string, input: WriteInput): Merchant {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(merchants).where(eq(merchants.id, id)).get();
    if (!existing) {
      throw new ServiceError("merchant_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("merchant_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(merchants).set({ archivedAt: null }).where(eq(merchants.id, id)).run();
    tx.audit({ entity: "merchants", entityId: id, action: "restore", before: withoutId(existing), after: withoutId(next) });
    return next;
  });
}
