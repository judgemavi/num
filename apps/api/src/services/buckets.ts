import { bucketCategories, buckets, categories } from "@num/db";
import {
  bucketColors,
  bucketIcons,
  bucketKinds,
  nextBucketColor,
  sinkingRepeats,
  utcNow,
  type Bucket,
  type BucketColor,
  type BucketIcon,
  type BucketKind,
  type BucketListQuery,
  type BucketWrite,
  type OverspentBucket,
  type SinkingRepeat,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { ServiceError } from "../service-error";
import { bucketBalances, type Reader } from "./bucket-balance";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type BucketRow = typeof buckets.$inferSelect;

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

function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(label);
  }
  return value as T;
}

function asKind(value: string): BucketKind {
  return oneOf(value, bucketKinds, "Unknown bucket kind");
}

function asColor(value: string): BucketColor {
  return oneOf(value, bucketColors, "Unknown bucket color");
}

function asIcon(value: string): BucketIcon {
  return oneOf(value, bucketIcons, "Unknown bucket icon");
}

function asRepeat(value: string | null): SinkingRepeat | null {
  if (value === null) {
    return null;
  }
  return oneOf(value, sinkingRepeats, "Unknown sinking repeat");
}

function assertKindFields(input: BucketWrite) {
  if (input.kind === "spending") {
    if (input.refillTo === null) {
      throw new ServiceError("bucket_fields_invalid", 400);
    }
    return;
  }
  if (input.kind === "sinking") {
    if (input.amount === null || input.dueDate === null || input.repeat === null) {
      throw new ServiceError("bucket_fields_invalid", 400);
    }
    return;
  }
  const dated = input.targetDate !== null;
  const fixed = input.fixedAmount !== null;
  if (input.target === null || dated === fixed) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
}

function categoryIdsFor(db: Reader, bucketId: string): string[] {
  return db
    .select({ categoryId: bucketCategories.categoryId })
    .from(bucketCategories)
    .where(eq(bucketCategories.bucketId, bucketId))
    .all()
    .map((row) => row.categoryId)
    .sort(compareText);
}

function allCategoryIds(db: Reader): Map<string, string[]> {
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

function snapshot(row: BucketRow, categoryIds: string[]) {
  return {
    name: row.name,
    kind: row.kind,
    priority: row.priority,
    essential: row.essential,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archivedAt,
    refillTo: row.refillTo,
    amount: row.amount,
    dueDate: row.dueDate,
    repeat: row.repeat,
    target: row.target,
    targetDate: row.targetDate,
    fixedAmount: row.fixedAmount,
    categoryIds,
  };
}

function toBucket(row: BucketRow, categoryIds: string[], balance: number): Bucket {
  return {
    id: row.id,
    name: row.name,
    kind: asKind(row.kind),
    priority: row.priority,
    essential: row.essential,
    color: asColor(row.color),
    icon: asIcon(row.icon),
    archivedAt: row.archivedAt,
    refillTo: row.refillTo,
    amount: row.amount,
    dueDate: row.dueDate,
    repeat: asRepeat(row.repeat),
    target: row.target,
    targetDate: row.targetDate,
    fixedAmount: row.fixedAmount,
    categoryIds,
    balance,
  };
}

function replaceCategories(tx: WriteTx, bucketId: string, categoryIds: string[]) {
  const previous = new Set(categoryIdsFor(tx, bucketId));
  const next = [...new Set(categoryIds)].sort(compareText);
  for (const categoryId of next) {
    const category = tx.select().from(categories).where(eq(categories.id, categoryId)).get();
    if (!category) {
      throw new ServiceError("category_not_found", 404);
    }
    if (category.kind !== "expense") {
      throw new ServiceError("category_not_expense", 400);
    }
    if (category.archivedAt && !previous.has(categoryId)) {
      throw new ServiceError("category_archived", 409);
    }
    const owner = tx
      .select({ bucketId: bucketCategories.bucketId })
      .from(bucketCategories)
      .where(eq(bucketCategories.categoryId, categoryId))
      .get();
    if (owner && owner.bucketId !== bucketId) {
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

function bucketCount(db: Reader): number {
  const row = db.select({ total: sql<unknown>`count(*)` }).from(buckets).get();
  return integerSum(row?.total ?? 0);
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
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
    nextColor: nextBucketColor(bucketCount(db)),
  };
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
      color: asColor(row.color),
      icon: asIcon(row.icon),
      balance: balances.get(row.id) ?? 0,
    }))
    .filter((row) => row.balance < 0);
  items.sort((left, right) => left.balance - right.balance || compareName(left.name, right.name) || compareText(left.id, right.id));
  return { items };
}

export function createBucket(db: Db, input: BucketWrite & WriteInput): Bucket {
  assertKindFields(input);
  const id = crypto.randomUUID();
  write(db, { source: input.source, at: input.at }, (tx) => {
    const row = rowValues(id, input, null);
    tx.insert(buckets).values(row).run();
    const categoryIds = replaceCategories(tx, id, input.categoryIds);
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row, categoryIds),
    });
  });
  return readBucket(db, id);
}

export function updateBucket(db: Db, id: string, input: BucketWrite & WriteInput): Bucket {
  assertKindFields(input);
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(buckets).where(eq(buckets.id, id)).get();
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    const beforeIds = categoryIdsFor(tx, id);
    const row = rowValues(id, input, existing.archivedAt);
    tx.update(buckets)
      .set({
        name: row.name,
        kind: row.kind,
        priority: row.priority,
        essential: row.essential,
        color: row.color,
        icon: row.icon,
        refillTo: row.refillTo,
        amount: row.amount,
        dueDate: row.dueDate,
        repeat: row.repeat,
        target: row.target,
        targetDate: row.targetDate,
        fixedAmount: row.fixedAmount,
      })
      .where(eq(buckets.id, id))
      .run();
    const categoryIds = replaceCategories(tx, id, input.categoryIds);
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "update",
      before: snapshot(existing, beforeIds),
      after: snapshot(row, categoryIds),
    });
  });
  return readBucket(db, id);
}

export function archiveBucket(db: Db, id: string, input: WriteInput): Bucket {
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(buckets).where(eq(buckets.id, id)).get();
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (existing.archivedAt) {
      throw new ServiceError("bucket_archived", 409);
    }
    const categoryIds = categoryIdsFor(tx, id);
    const next = { ...existing, archivedAt: at };
    tx.update(buckets).set({ archivedAt: at }).where(eq(buckets.id, id)).run();
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "archive",
      before: snapshot(existing, categoryIds),
      after: snapshot(next, categoryIds),
    });
  });
  return readBucket(db, id);
}

export function restoreBucket(db: Db, id: string, input: WriteInput): Bucket {
  write(db, { source: input.source, at: input.at }, (tx) => {
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
  });
  return readBucket(db, id);
}
