import { merchants, type MerchantRow } from "@num/db";
import {
  foldName,
  nameKey,
  merchantCreateSchema,
  utcNow,
  type Merchant,
  type MerchantCreate,
  type MerchantListQuery,
  type MerchantUpdate,
} from "@num/shared";
import { eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { assertUniqueName, setArchived, byName, pagedOf, totalOf, windowOf } from "./list-sql";
import { mergedWrite } from "./patch";
import { withoutId, write, type Reader, type WriteInput } from "./write";

/** The stored row has the sort key. The API shows the fields of the schema only. */
function toMerchant({ id, name, archivedAt }: MerchantRow): Merchant {
  return { id, name, archivedAt };
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
    assertUniqueName(tx, merchants, row.name, "merchant_name_taken");
    tx.insert(merchants).values({ ...row, sortKey: foldName(row.name), nameKey: nameKey(row.name) }).run();
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
    assertUniqueName(tx, merchants, next.name, "merchant_name_taken", id);
    tx.update(merchants).set({ name: next.name, sortKey: foldName(next.name), nameKey: nameKey(next.name) }).where(eq(merchants.id, id)).run();
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
    return setArchived(tx, merchants, existing, "merchants", at);
  });
}

export function restoreMerchant(db: Db, id: string, input: WriteInput): Merchant {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = getMerchant(tx, id);
    return setArchived(tx, merchants, existing, "merchants", null);
  });
}
