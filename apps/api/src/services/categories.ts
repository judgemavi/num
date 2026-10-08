import { categories, categoryGroups } from "@num/db";
import {
  categoryKinds,
  utcNow,
  type Category,
  type CategoryCreate,
  type CategoryGroup,
  type CategoryGroupCreate,
  type CategoryGroupUpdate,
  type CategoryKind,
  type CategoryListQuery,
  type CategoryUpdate,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type CategoryRow = typeof categories.$inferSelect;
type GroupRow = typeof categoryGroups.$inferSelect;

function asKind(value: string): CategoryKind {
  if (!(categoryKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown category kind");
  }
  return value as CategoryKind;
}

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

function groupSnapshot(row: { name: string; sortOrder: number }) {
  return { name: row.name, sortOrder: row.sortOrder };
}

function categorySnapshot(row: {
  name: string;
  kind: string;
  groupId: string | null;
  essential: boolean;
  archivedAt: string | null;
}) {
  return {
    name: row.name,
    kind: row.kind,
    groupId: row.groupId,
    essential: row.essential,
    archivedAt: row.archivedAt,
  };
}

function toGroup(row: GroupRow): CategoryGroup {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: asKind(row.kind),
    groupId: row.groupId,
    essential: row.essential,
    archivedAt: row.archivedAt,
  };
}

function assertGroup(tx: WriteTx, groupId: string | null) {
  if (groupId === null) {
    return;
  }
  const group = tx.select({ id: categoryGroups.id }).from(categoryGroups).where(eq(categoryGroups.id, groupId)).get();
  if (!group) {
    throw new ServiceError("group_not_found", 404);
  }
}

function assertCategoryName(tx: WriteTx, name: string, exceptId?: string) {
  const row = tx
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${name})`)
    .get();
  if (row && row.id !== exceptId) {
    throw new ServiceError("category_name_taken", 409);
  }
}

function assertEssential(kind: CategoryKind, essential: boolean) {
  if (kind === "income" && essential) {
    throw new ServiceError("essential_expense_only", 400);
  }
}

export function listCategoryGroups(db: Db): { items: CategoryGroup[] } {
  const items = db
    .select()
    .from(categoryGroups)
    .all()
    .map(toGroup)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      const name = compareName(left.name, right.name);
      if (name !== 0) {
        return name;
      }
      return compareText(left.id, right.id);
    });
  return { items };
}

export function createCategoryGroup(db: Db, input: CategoryGroupCreate & WriteInput): CategoryGroup {
  const id = crypto.randomUUID();
  let created: CategoryGroup | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const rows = tx.select({ sortOrder: categoryGroups.sortOrder }).from(categoryGroups).all();
    const sortOrder = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const row = { id, name: input.name.trim(), sortOrder };
    tx.insert(categoryGroups).values(row).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "create",
      before: null,
      after: groupSnapshot(row),
    });
    created = toGroup(row);
  });
  if (!created) {
    throw new Error("Create did not return a group");
  }
  return created;
}

export function updateCategoryGroup(
  db: Db,
  id: string,
  input: CategoryGroupUpdate & WriteInput,
): CategoryGroup {
  let updated: CategoryGroup | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get();
    if (!existing) {
      throw new ServiceError("group_not_found", 404);
    }
    const next = { name: input.name.trim(), sortOrder: existing.sortOrder };
    tx.update(categoryGroups).set({ name: next.name }).where(eq(categoryGroups.id, id)).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "update",
      before: groupSnapshot(existing),
      after: groupSnapshot(next),
    });
    updated = toGroup({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a group");
  }
  return updated;
}

export function deleteCategoryGroup(db: Db, id: string, input: WriteInput): void {
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get();
    if (!existing) {
      throw new ServiceError("group_not_found", 404);
    }
    const used = tx.select({ id: categories.id }).from(categories).where(eq(categories.groupId, id)).get();
    if (used) {
      throw new ServiceError("group_in_use", 409);
    }
    tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "delete",
      before: groupSnapshot(existing),
      after: null,
    });
  });
}

export function reorderCategoryGroups(db: Db, ids: string[], input: WriteInput): { items: CategoryGroup[] } {
  const current = db.select().from(categoryGroups).all();
  const byId = new Map(current.map((row) => [row.id, row]));
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new ServiceError("group_order_invalid", 400);
  }
  const changes = ids.flatMap((id, index) => {
    const row = byId.get(id);
    if (!row || row.sortOrder === index) {
      return [];
    }
    return [{ row, sortOrder: index }];
  });
  if (changes.length === 0) {
    return listCategoryGroups(db);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const change of changes) {
      tx.update(categoryGroups)
        .set({ sortOrder: change.sortOrder })
        .where(eq(categoryGroups.id, change.row.id))
        .run();
      tx.audit({
        entity: "category_groups",
        entityId: change.row.id,
        action: "update",
        before: groupSnapshot(change.row),
        after: groupSnapshot({ name: change.row.name, sortOrder: change.sortOrder }),
      });
    }
  });
  return listCategoryGroups(db);
}

export function listCategories(db: Db, query: CategoryListQuery) {
  const rows = db
    .select()
    .from(categories)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .map(toCategory);
  const sort = query.sort ?? "name";
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const field = sort === "kind" ? compareText(left.kind, right.kind) : compareName(left.name, right.name);
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

export function createCategory(db: Db, input: CategoryCreate & WriteInput): Category {
  const essential = input.essential ?? false;
  assertEssential(input.kind, essential);
  const id = crypto.randomUUID();
  const row = {
    id,
    name: input.name.trim(),
    kind: input.kind,
    groupId: input.groupId ?? null,
    essential,
    archivedAt: null,
  };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertGroup(tx, row.groupId);
    assertCategoryName(tx, row.name);
    tx.insert(categories).values(row).run();
    tx.audit({
      entity: "categories",
      entityId: id,
      action: "create",
      before: null,
      after: categorySnapshot(row),
    });
  });
  return toCategory(row);
}

export function updateCategory(db: Db, id: string, input: CategoryUpdate & WriteInput): Category {
  let updated: Category | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) {
      throw new ServiceError("category_not_found", 404);
    }
    const kind = asKind(existing.kind);
    assertEssential(kind, input.essential);
    assertGroup(tx, input.groupId);
    const name = input.name.trim();
    assertCategoryName(tx, name, id);
    const next = {
      name,
      kind: existing.kind,
      groupId: input.groupId,
      essential: input.essential,
      archivedAt: existing.archivedAt,
    };
    tx.update(categories)
      .set({ name: next.name, groupId: next.groupId, essential: next.essential })
      .where(eq(categories.id, id))
      .run();
    tx.audit({
      entity: "categories",
      entityId: id,
      action: "update",
      before: categorySnapshot(existing),
      after: categorySnapshot(next),
    });
    updated = toCategory({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a category");
  }
  return updated;
}

export function archiveCategory(db: Db, id: string, input: WriteInput): Category {
  const at = input.at ?? utcNow();
  let archived: Category | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) {
      throw new ServiceError("category_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("category_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(categories).set({ archivedAt: at }).where(eq(categories.id, id)).run();
    tx.audit({
      entity: "categories",
      entityId: id,
      action: "archive",
      before: categorySnapshot(existing),
      after: categorySnapshot(next),
    });
    archived = toCategory(next);
  });
  if (!archived) {
    throw new Error("Archive did not return a category");
  }
  return archived;
}
