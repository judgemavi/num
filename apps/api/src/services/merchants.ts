import { merchants, type MerchantRow } from "@num/db";
import {
  foldName,
  merchantCreateSchema,
  utcNow,
  type Merchant,
  type MerchantCreate,
  type MerchantListQuery,
  type MerchantUpdate,
} from "@num/shared";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { byName, pagedOf, totalOf, windowOf } from "./list-sql";
import { mergedWrite } from "./patch";
import { withoutId, write, type Reader, type WriteTx, type WriteInput } from "./write";

/** The stored row has the sort key. The API shows the fields of the schema only. */
function toMerchant({ id, name, archivedAt }: MerchantRow): Merchant {
  return { id, name, archivedAt };
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

export function getMerchant(db: Reader, id: string): Merchant {
  const row = db.select().from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  return toMerchant(row);
}

/** Sort, page and count run in SQL. The order is the folded name, then the name, then the id. */
export function listMerchants(db: Db, query: MerchantListQuery) {
  const where = query.archived ? isNotNull(merchants.archivedAt) : isNull(merchants.archivedAt);
  const rows = db
    .select()
    .from(merchants)
    .where(where)
    .orderBy(...byName(merchants, query.dir))
    .limit(windowOf(query).limit)
    .offset(windowOf(query).offset)
    .all();
  return pagedOf(rows.map(toMerchant), totalOf(db, merchants, where), query);
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
    tx.insert(merchants).values({ ...row, sortKey: foldName(row.name) }).run();
    tx.audit({ entity: "merchants", entityId: id, action: "create", before: null, after: withoutId(row) });
  });
  return row;
}

export function updateMerchant(db: Db, id: string, input: MerchantUpdate & WriteInput): Merchant {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = getMerchant(tx, id);
    const next = {
      name: mergedWrite(merchantCreateSchema, existing, input).name,
      archivedAt: existing.archivedAt,
    };
    assertName(tx, next.name, id);
    tx.update(merchants).set({ name: next.name, sortKey: foldName(next.name) }).where(eq(merchants.id, id)).run();
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
    const existing = getMerchant(tx, id);
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
    const existing = getMerchant(tx, id);
    if (!existing.archivedAt) {
      throw new ServiceError("merchant_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(merchants).set({ archivedAt: null }).where(eq(merchants.id, id)).run();
    tx.audit({ entity: "merchants", entityId: id, action: "restore", before: withoutId(existing), after: withoutId(next) });
    return next;
  });
}
