import { tags } from "@num/db";
import { foldName, utcNow, type Tag, type TagCreate, type TagListQuery, type TagUpdate } from "@num/shared";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";
import { byName, pagedOf, totalOf, windowOf, withoutSortKey } from "./list-sql";

function assertTagName(tx: WriteTx, name: string, exceptId?: string) {
  const row = tx
    .select({ id: tags.id })
    .from(tags)
    .where(sql`lower(${tags.name}) = lower(${name})`)
    .get();
  if (row && row.id !== exceptId) {
    throw new ServiceError("tag_name_taken", 409);
  }
}

export function getTag(db: Db, id: string): Tag {
  const row = withoutSortKey(db.select().from(tags).where(eq(tags.id, id)).get());
  if (!row) {
    throw new ServiceError("tag_not_found", 404);
  }
  return row;
}

export function listTags(db: Db, query: TagListQuery) {
  const where = query.archived ? isNotNull(tags.archivedAt) : isNull(tags.archivedAt);
  const { limit, offset } = windowOf(query);
  const rows = db.select().from(tags).where(where).orderBy(...byName(tags, query.dir)).limit(limit).offset(offset).all();
  return pagedOf(rows.map((row) => withoutSortKey(row)), totalOf(db, tags, where), query);
}

export function createTag(db: Db, input: TagCreate & WriteInput): Tag {
  const id = crypto.randomUUID();
  const row = { id, name: input.name.trim(), archivedAt: null };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertTagName(tx, row.name);
    tx.insert(tags).values({ ...row, sortKey: foldName(row.name) }).run();
    tx.audit({
      entity: "tags",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
  });
  return row;
}

export function updateTag(db: Db, id: string, input: TagUpdate & WriteInput): Tag {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(tags).where(eq(tags.id, id)).get());
    if (!existing) {
      throw new ServiceError("tag_not_found", 404);
    }
    const name = input.name.trim();
    assertTagName(tx, name, id);
    const next = { name, archivedAt: existing.archivedAt };
    tx.update(tags).set({ name, sortKey: foldName(name) }).where(eq(tags.id, id)).run();
    tx.audit({
      entity: "tags",
      entityId: id,
      action: "update",
      before: withoutId(existing),
      after: next,
    });
    return { id, ...next };
  });
}

export function archiveTag(db: Db, id: string, input: WriteInput): Tag {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(tags).where(eq(tags.id, id)).get());
    if (!existing) {
      throw new ServiceError("tag_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("tag_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(tags).set({ archivedAt: at }).where(eq(tags.id, id)).run();
    tx.audit({
      entity: "tags",
      entityId: id,
      action: "archive",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}

export function restoreTag(db: Db, id: string, input: WriteInput): Tag {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(tags).where(eq(tags.id, id)).get());
    if (!existing) {
      throw new ServiceError("tag_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("tag_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(tags).set({ archivedAt: null }).where(eq(tags.id, id)).run();
    tx.audit({
      entity: "tags",
      entityId: id,
      action: "restore",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}
