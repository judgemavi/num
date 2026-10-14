import { bucketCategories, categories, categoryGroups, transactionLines } from "@num/db";
import {
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
import { withoutId, write, type WriteTx, type WriteInput } from "./write";
import { compareText, pageOf } from "./paging";

function compareName(left: string, right: string) {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
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

function assertGroupName(tx: WriteTx, name: string, exceptId?: string) {
  const row = tx
    .select({ id: categoryGroups.id })
    .from(categoryGroups)
    .where(sql`lower(${categoryGroups.name}) = lower(${name})`)
    .get();
  if (row && row.id !== exceptId) {
    throw new ServiceError("group_name_taken", 409);
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

function assertKindChange(tx: WriteTx, id: string, current: CategoryKind, next: CategoryKind) {
  if (current === next) {
    return;
  }
  const line = tx.select({ id: transactionLines.id }).from(transactionLines).where(eq(transactionLines.categoryId, id)).get();
  const bucket = tx
    .select({ categoryId: bucketCategories.categoryId })
    .from(bucketCategories)
    .where(eq(bucketCategories.categoryId, id))
    .get();
  if (line || bucket) {
    throw new ServiceError("category_kind_locked", 409);
  }
}

export function getCategoryGroup(db: Db, id: string): CategoryGroup {
  const row = db.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get();
  if (!row) {
    throw new ServiceError("group_not_found", 404);
  }
  return row;
}

export function getCategory(db: Db, id: string): Category {
  const row = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  return row;
}

export function listCategoryGroups(db: Db): { items: CategoryGroup[] } {
  const items = db.select().from(categoryGroups).all();
  items.sort((left, right) => compareName(left.name, right.name) || compareText(left.id, right.id));
  return { items };
}

export function createCategoryGroup(db: Db, input: CategoryGroupCreate & WriteInput): CategoryGroup {
  const id = crypto.randomUUID();
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const row = { id, name: input.name.trim() };
    assertGroupName(tx, row.name);
    tx.insert(categoryGroups).values(row).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
    return row;
  });
}

export function updateCategoryGroup(
  db: Db,
  id: string,
  input: CategoryGroupUpdate & WriteInput,
): CategoryGroup {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get();
    if (!existing) {
      throw new ServiceError("group_not_found", 404);
    }
    const next = { name: input.name.trim() };
    assertGroupName(tx, next.name, id);
    tx.update(categoryGroups).set({ name: next.name }).where(eq(categoryGroups.id, id)).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "update",
      before: withoutId(existing),
      after: next,
    });
    return { id, ...next };
  });
}

export function deleteCategoryGroup(db: Db, id: string, input: WriteInput): void {
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categoryGroups).where(eq(categoryGroups.id, id)).get();
    if (!existing) {
      throw new ServiceError("group_not_found", 404);
    }
    const members = tx.select().from(categories).where(eq(categories.groupId, id)).all();
    for (const category of members) {
      const next = { ...category, groupId: null };
      tx.update(categories).set({ groupId: null }).where(eq(categories.id, category.id)).run();
      tx.audit({
        entity: "categories",
        entityId: category.id,
        action: "update",
        before: withoutId(category),
        after: withoutId(next),
      });
    }
    tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
    tx.audit({
      entity: "category_groups",
      entityId: id,
      action: "delete",
      before: withoutId(existing),
      after: null,
    });
  });
}

export function listCategories(db: Db, query: CategoryListQuery) {
  const rows = db
    .select()
    .from(categories)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .filter((row) => {
      if (query.groupId === undefined) {
        return true;
      }
      if (query.groupId === "none") {
        return row.groupId === null;
      }
      return row.groupId === query.groupId;
    });
  const sort = query.sort ?? "name";
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const field = sort === "kind" ? compareText(left.kind, right.kind) : compareName(left.name, right.name);
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  return pageOf(rows, query);
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
      after: withoutId(row),
    });
  });
  return row;
}

export function updateCategory(db: Db, id: string, input: CategoryUpdate & WriteInput): Category {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) {
      throw new ServiceError("category_not_found", 404);
    }
    assertKindChange(tx, id, existing.kind, input.kind);
    assertEssential(input.kind, input.essential);
    assertGroup(tx, input.groupId);
    const name = input.name.trim();
    assertCategoryName(tx, name, id);
    const next = {
      name,
      kind: input.kind,
      groupId: input.groupId,
      essential: input.essential,
      archivedAt: existing.archivedAt,
    };
    tx.update(categories)
      .set({ name: next.name, kind: next.kind, groupId: next.groupId, essential: next.essential })
      .where(eq(categories.id, id))
      .run();
    tx.audit({
      entity: "categories",
      entityId: id,
      action: "update",
      before: withoutId(existing),
      after: next,
    });
    return { id, ...next };
  });
}

export function archiveCategory(db: Db, id: string, input: WriteInput): Category {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
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
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}

export function restoreCategory(db: Db, id: string, input: WriteInput): Category {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) {
      throw new ServiceError("category_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("category_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(categories).set({ archivedAt: null }).where(eq(categories.id, id)).run();
    tx.audit({
      entity: "categories",
      entityId: id,
      action: "restore",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}
