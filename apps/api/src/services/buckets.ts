import { bucketCategories, buckets, categories, type BucketRow } from "@num/db";
import {
  isIsoDate,
  kindFieldsValid,
  nextBucketColor,
  utcNow,
  type Bucket,
  type BucketCreate,
  type BucketListQuery,
  type BucketWrite,
  type OverspentBucket,
} from "@num/shared";
import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { withoutId, write, type WriteTx, type WriteInput, type Reader } from "./write";
import { compareText, pageOf } from "./paging";

function compareName(left: string, right: string) {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
}

/** The route schema uses the same rule. This check is for callers that are not routes. */
function assertKindFields(input: BucketCreate) {
  if (!kindFieldsValid(input)) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
}

function categoryIdsFor(db: Reader, bucketId: string) {
  return db
    .select({ categoryId: bucketCategories.categoryId })
    .from(bucketCategories)
    .where(eq(bucketCategories.bucketId, bucketId))
    .all()
    .map((row) => row.categoryId)
    .sort(compareText);
}

function allCategoryIds(db: Reader) {
  const map = new Map<string, string[]>();
  for (const row of db.select().from(bucketCategories).all()) {
    const list = map.get(row.bucketId) ?? [];
    list.push(row.categoryId);
    map.set(row.bucketId, list);
  }
  for (const list of map.values()) {
    list.sort(compareText);
  }
  return map;
}

/** The audit log keeps the bucket row without its id, and the categories of the bucket. */
function snapshot(row: BucketRow, categoryIds: string[]) {
  return { ...withoutId(row), categoryIds };
}

function toBucket({ startDate, ...row }: BucketRow, categoryIds: string[], balance: number): Bucket {
  return { ...row, categoryIds, startDate, balance };
}

function replaceCategories(tx: WriteTx, bucketId: string, categoryIds: string[]) {
  const previous = new Set(categoryIdsFor(tx, bucketId));
  const next = [...new Set(categoryIds)].sort(compareText);
  const found = new Map(
    tx
      .select()
      .from(categories)
      .where(inArray(categories.id, next))
      .all()
      .map((row) => [row.id, row]),
  );
  const owners = new Map(
    tx
      .select()
      .from(bucketCategories)
      .where(inArray(bucketCategories.categoryId, next))
      .all()
      .map((row) => [row.categoryId, row.bucketId]),
  );
  for (const categoryId of next) {
    const category = found.get(categoryId);
    if (!category) {
      throw new ServiceError("category_not_found", 404);
    }
    if (category.kind !== "expense") {
      throw new ServiceError("category_not_expense", 400);
    }
    if (category.archivedAt && !previous.has(categoryId)) {
      throw new ServiceError("category_archived", 409);
    }
    const owner = owners.get(categoryId);
    if (owner !== undefined && owner !== bucketId) {
      throw new ServiceError("category_in_bucket", 409);
    }
  }
  tx.delete(bucketCategories).where(eq(bucketCategories.bucketId, bucketId)).run();
  if (next.length > 0) {
    tx.insert(bucketCategories)
      .values(next.map((categoryId) => ({ categoryId, bucketId })))
      .run();
  }
  return next;
}

function rowValues(id: string, input: BucketWrite, archivedAt: string | null): BucketRow {
  return {
    id,
    name: input.name.trim(),
    kind: input.kind,
    priority: input.priority,
    essential: input.essential,
    color: input.color,
    icon: input.icon,
    startDate: input.startDate,
    archivedAt,
    refillTo: input.refillTo,
    amount: input.amount,
    dueDate: input.dueDate,
    repeat: input.repeat,
    target: input.target,
    targetDate: input.targetDate,
    fixedAmount: input.fixedAmount,
  };
}

export function readBucket(db: Reader, id: string): Bucket {
  const row = db.select().from(buckets).where(eq(buckets.id, id)).get();
  if (!row) {
    throw new ServiceError("bucket_not_found", 404);
  }
  const balance = bucketBalances(db).get(id) ?? 0;
  return toBucket(row, categoryIdsFor(db, id), balance);
}

function bucketCount(db: Reader) {
  const row = db.select({ total: sql<number>`count(*)` }).from(buckets).get();
  return row?.total ?? 0;
}

export function listBuckets(db: Db, query: BucketListQuery) {
  const balances = bucketBalances(db);
  const categoriesByBucket = allCategoryIds(db);
  const rows = db
    .select()
    .from(buckets)
    .all()
    .filter((row) => (query.archived ? row.archivedAt !== null : row.archivedAt === null))
    .map((row) => toBucket(row, categoriesByBucket.get(row.id) ?? [], balances.get(row.id) ?? 0));
  const sort = query.sort ?? "priority";
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const field =
      sort === "name"
        ? compareName(left.name, right.name)
        : sort === "kind"
          ? compareText(left.kind, right.kind)
          : left.priority - right.priority;
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  return { ...pageOf(rows, query), nextColor: nextBucketColor(bucketCount(db)) };
}

export function listOverspent(db: Db): { items: OverspentBucket[] } {
  const balances = bucketBalances(db);
  const items = db
    .select()
    .from(buckets)
    .all()
    .filter((row) => row.archivedAt === null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      balance: balances.get(row.id) ?? 0,
    }))
    .filter((row) => row.balance < 0);
  items.sort((left, right) => left.balance - right.balance || compareName(left.name, right.name) || compareText(left.id, right.id));
  return { items };
}

export function createBucket(db: Db, input: BucketCreate & WriteInput & { asOf: string }): Bucket {
  assertKindFields(input);
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  const id = crypto.randomUUID();
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const row = rowValues(id, { ...input, startDate: input.startDate ?? input.asOf }, null);
    tx.insert(buckets).values(row).run();
    const categoryIds = replaceCategories(tx, id, input.categoryIds);
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row, categoryIds),
    });
    return readBucket(tx, id);
  });
}

export function updateBucket(db: Db, id: string, input: BucketWrite & WriteInput): Bucket {
  assertKindFields(input);
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(buckets).where(eq(buckets.id, id)).get();
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    const beforeIds = categoryIdsFor(tx, id);
    const row = rowValues(id, input, existing.archivedAt);
    tx.update(buckets).set(withoutId(row)).where(eq(buckets.id, id)).run();
    const categoryIds = replaceCategories(tx, id, input.categoryIds);
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "update",
      before: snapshot(existing, beforeIds),
      after: snapshot(row, categoryIds),
    });
    return readBucket(tx, id);
  });
}

export function archiveBucket(db: Db, id: string, input: WriteInput): Bucket {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(buckets).where(eq(buckets.id, id)).get();
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("bucket_archived", 409);
    }
    const balance = bucketBalances(tx).get(id) ?? 0;
    if (balance !== 0) {
      throw new ServiceError("bucket_balance", 409);
    }
    const categoryIds = categoryIdsFor(tx, id);
    tx.delete(bucketCategories).where(eq(bucketCategories.bucketId, id)).run();
    const next = { ...existing, archivedAt: at };
    tx.update(buckets).set({ archivedAt: at }).where(eq(buckets.id, id)).run();
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "archive",
      before: snapshot(existing, categoryIds),
      after: snapshot(next, []),
    });
    return readBucket(tx, id);
  });
}

export function restoreBucket(db: Db, id: string, input: WriteInput): Bucket {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(buckets).where(eq(buckets.id, id)).get();
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("bucket_not_archived", 409);
    }
    const categoryIds = categoryIdsFor(tx, id);
    const next = { ...existing, archivedAt: null };
    tx.update(buckets).set({ archivedAt: null }).where(eq(buckets.id, id)).run();
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "restore",
      before: snapshot(existing, categoryIds),
      after: snapshot(next, categoryIds),
    });
    return readBucket(tx, id);
  });
}
