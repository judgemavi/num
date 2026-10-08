import { tags } from "@num/db";
import { utcNow, type Tag, type TagCreate, type TagListQuery, type TagUpdate } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type TagRow = typeof tags.$inferSelect;

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
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
}

function snapshot(row: { name: string; archivedAt: string | null }) {
  return { name: row.name, archivedAt: row.archivedAt };
}

function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, archivedAt: row.archivedAt };
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
  return toTag(row);
}

export function listTags(db: Db, query: TagListQuery) {
  const rows = db
    .select()
    .from(tags)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .map(toTag);
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const name = compareName(left.name, right.name);
    if (name !== 0) {
      return name * dir;
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
      after: snapshot(row),
    });
  });
  return toTag(row);
}

export function updateTag(db: Db, id: string, input: TagUpdate & WriteInput): Tag {
  let updated: Tag | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
      before: snapshot(existing),
      after: snapshot(next),
    });
    updated = toTag({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a tag");
  }
  return updated;
}

export function archiveTag(db: Db, id: string, input: WriteInput): Tag {
  const at = input.at ?? utcNow();
  let archived: Tag | undefined;
  write(db, { source: input.source, at }, (tx) => {
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
      before: snapshot(existing),
      after: snapshot(next),
    });
    archived = toTag(next);
  });
  if (!archived) {
    throw new Error("Archive did not return a tag");
  }
  return archived;
}

export function restoreTag(db: Db, id: string, input: WriteInput): Tag {
  let restored: Tag | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
      before: snapshot(existing),
      after: snapshot(next),
    });
    restored = toTag(next);
  });
  if (!restored) {
    throw new Error("Restore did not return a tag");
  }
  return restored;
}
