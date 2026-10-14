import { tags } from "@num/db";
import { utcNow, type Tag, type TagCreate, type TagListQuery, type TagUpdate } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";
import { compareText, pageOf } from "./paging";

function compareName(left: string, right: string) {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
}

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
  const row = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!row) {
    throw new ServiceError("tag_not_found", 404);
  }
  return row;
}

export function listTags(db: Db, query: TagListQuery) {
  const rows = db
    .select()
    .from(tags)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null));
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const name = compareName(left.name, right.name);
    if (name !== 0) {
      return name * dir;
    }
    return compareText(left.id, right.id);
  });
  return pageOf(rows, query);
}

export function createTag(db: Db, input: TagCreate & WriteInput): Tag {
  const id = crypto.randomUUID();
  const row = { id, name: input.name.trim(), archivedAt: null };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertTagName(tx, row.name);
    tx.insert(tags).values(row).run();
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
    const existing = tx.select().from(tags).where(eq(tags.id, id)).get();
    if (!existing) {
      throw new ServiceError("tag_not_found", 404);
    }
    const name = input.name.trim();
    assertTagName(tx, name, id);
    const next = { name, archivedAt: existing.archivedAt };
    tx.update(tags).set({ name }).where(eq(tags.id, id)).run();
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
    const existing = tx.select().from(tags).where(eq(tags.id, id)).get();
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
    const existing = tx.select().from(tags).where(eq(tags.id, id)).get();
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
