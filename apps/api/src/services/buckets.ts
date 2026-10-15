import { bucketCategories, buckets, categories, schedules, type BucketRow } from "@num/db";
import {
  bucketWriteSchema,
  emergencyDefaults,
  foldName,
  hasSchedule,
  isIsoDate,
  kindFieldsValid,
  nextBucketColor,
  utcNow,
  type Bucket,
  type BucketCreate,
  type BucketListQuery,
  type BucketUpdate,
  type BucketWrite,
  type OverspentBucket,
  type Schedule,
} from "@num/shared";
import { asc, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { mergedWrite } from "./patch";
import { withoutId, write, type WriteTx, type WriteInput, type Reader } from "./write";
import { byColumn, byName, pagedOf, totalOf, windowOf, withoutSortKey } from "./list-sql";
import { assertScheduleRefs, putSchedule, scheduleOf } from "./schedules";
import { requireWholeAmounts } from "./book-step";

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
    .sort();
}

function allCategoryIds(db: Reader) {
  const map = new Map<string, string[]>();
  for (const row of db.select().from(bucketCategories).all()) {
    const list = map.get(row.bucketId) ?? [];
    list.push(row.categoryId);
    map.set(row.bucketId, list);
  }
  for (const list of map.values()) {
    list.sort();
  }
  return map;
}

type BucketFields = Omit<BucketRow, "sortKey">;

/** The audit log keeps the bucket row without its id, the categories of the bucket and its schedule. */
function snapshot(row: BucketFields, categoryIds: string[], schedule: Schedule | null) {
  return { ...withoutId(row), categoryIds, schedule };
}

function toBucket({ startDate, ...row }: BucketFields, categoryIds: string[], schedule: Schedule | null, balance: number): Bucket {
  return { ...row, categoryIds, schedule, startDate, balance };
}

function allSchedules(db: Reader) {
  return new Map(
    db
      .select()
      .from(schedules)
      .all()
      .map(({ bucketId, ...fields }) => [bucketId, fields] as const),
  );
}

function scheduleAmounts(schedule: Schedule | null | undefined) {
  return [schedule?.expectedAmount, schedule?.tolerance];
}

function replaceCategories(tx: WriteTx, bucketId: string, categoryIds: string[]) {
  const previous = new Set(categoryIdsFor(tx, bucketId));
  const next = [...new Set(categoryIds)].sort();
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

function rowValues(id: string, input: BucketWrite, archivedAt: string | null): BucketFields {
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
    months: input.months,
    fillMonths: input.fillMonths,
  };
}

export function readBucket(db: Reader, id: string): Bucket {
  const row = withoutSortKey(db.select().from(buckets).where(eq(buckets.id, id)).get());
  if (!row) {
    throw new ServiceError("bucket_not_found", 404);
  }
  const balance = bucketBalances(db).get(id) ?? 0;
  return toBucket(row, categoryIdsFor(db, id), scheduleOf(db, id), balance);
}

/** Priority sort: the direction applies to the priority. A commitment comes first in a tie, then the id (decision 0062 item 8). */
const dir = (column: typeof buckets.priority, direction: "asc" | "desc" | undefined) => (direction === "desc" ? desc(column) : asc(column));

function bucketCount(db: Reader) {
  return totalOf(db, buckets, undefined);
}

export function listBuckets(db: Db, query: BucketListQuery) {
  const balances = bucketBalances(db);
  const categoriesByBucket = allCategoryIds(db);
  const schedulesByBucket = allSchedules(db);
  const where = query.archived ? isNotNull(buckets.archivedAt) : isNull(buckets.archivedAt);
  const sort = query.sort ?? "priority";
  const order =
    sort === "name"
      ? byName(buckets, query.dir)
      : sort === "kind"
        ? byColumn(buckets.kind, buckets.id, query.dir)
        : [dir(buckets.priority, query.dir), desc(sql`${buckets.kind} = 'commitment'`), asc(buckets.id)];
  const { limit, offset } = windowOf(query);
  const rows = db.select().from(buckets).where(where).orderBy(...order).limit(limit).offset(offset).all();
  const items = rows.map((row) => toBucket(withoutSortKey(row), categoriesByBucket.get(row.id) ?? [], schedulesByBucket.get(row.id) ?? null, balances.get(row.id) ?? 0));
  return { ...pagedOf(items, totalOf(db, buckets, where), query), nextColor: nextBucketColor(bucketCount(db)) };
}

/** The balance is a calculated value, thus the balance sort runs in code. The rows come in name order, and the sort is stable. */
export function listOverspent(db: Db): { items: OverspentBucket[] } {
  const balances = bucketBalances(db);
  const items = db
    .select()
    .from(buckets)
    .where(isNull(buckets.archivedAt))
    .orderBy(...byName(buckets, "asc"))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      balance: balances.get(row.id) ?? 0,
    }))
    .filter((row) => row.balance < 0);
  items.sort((left, right) => left.balance - right.balance);
  return { items };
}

/** One emergency bucket in a book, also an archived one (decision 0060). */
function assertNoEmergency(tx: WriteTx) {
  if (tx.select({ id: buckets.id }).from(buckets).where(eq(buckets.kind, "emergency")).get()) {
    throw new ServiceError("bucket_emergency_exists", 409);
  }
}

/** The insert and the audit entry of a new bucket. Part of a write. */
function insertBucket(tx: WriteTx, input: BucketCreate & { asOf: string }): string {
  if (input.kind === "emergency") {
    assertNoEmergency(tx);
  }
  const id = crypto.randomUUID();
  const row = rowValues(id, { ...input, startDate: input.startDate ?? input.asOf }, null);
  tx.insert(buckets).values({ ...row, sortKey: foldName(row.name) }).run();
  const categoryIds = replaceCategories(tx, id, input.categoryIds);
  if (input.schedule && hasSchedule(input.kind)) {
    assertScheduleRefs(tx, input.kind, input.schedule);
    putSchedule(tx, id, input.schedule);
  }
  tx.audit({
    entity: "buckets",
    entityId: id,
    action: "create",
    before: null,
    after: snapshot(row, categoryIds, input.schedule),
  });
  return id;
}

/** The emergency bucket with the default settings (decision 0060). The setup and the fill make it. */
export function insertEmergencyBucket(tx: WriteTx, asOf: string): string {
  const last = tx
    .select({ priority: max(buckets.priority) })
    .from(buckets)
    .where(inArray(buckets.kind, ["spending", "sinking"]))
    .get();
  return insertBucket(tx, {
    name: "Emergency fund",
    kind: "emergency",
    // After the spending and sinking buckets, before the goals (decision 0060).
    priority: (last?.priority ?? -1) + 1,
    essential: true,
    color: "sky",
    icon: "shield",
    categoryIds: [],
    refillTo: null,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    schedule: null,
    ...emergencyDefaults,
    asOf,
  });
}

export function createBucket(db: Db, input: BucketCreate & WriteInput & { asOf: string }): Bucket {
  assertKindFields(input);
  requireWholeAmounts(db, [input.refillTo, input.amount, input.target, input.fixedAmount, ...scheduleAmounts(input.schedule)]);
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  return write(db, { source: input.source, at: input.at }, (tx) => readBucket(tx, insertBucket(tx, input)));
}

/** A bucket keeps its family: a commitment, an income, the emergency fund, or a spending, sinking or goal bucket. */
function sameFamily(left: BucketRow["kind"], right: BucketRow["kind"]) {
  const family = (kind: BucketRow["kind"]) => (kind === "spending" || kind === "sinking" || kind === "goal" ? "plain" : kind);
  return family(left) === family(right);
}

/** A PATCH: a field that the patch leaves out keeps its stored value. The kind fields are checked on the result. */
export function updateBucket(db: Db, id: string, input: BucketUpdate & WriteInput): Bucket {
  // Only the amounts in the patch. A stored amount is not checked again (decision 0040).
  requireWholeAmounts(db, [input.refillTo, input.amount, input.target, input.fixedAmount, ...scheduleAmounts(input.schedule)]);
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(buckets).where(eq(buckets.id, id)).get());
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    const beforeIds = categoryIdsFor(tx, id);
    const beforeSchedule = scheduleOf(tx, id);
    const next = mergedWrite(bucketWriteSchema, { ...existing, categoryIds: beforeIds, schedule: beforeSchedule }, input);
    if (!sameFamily(existing.kind, next.kind)) {
      throw new ServiceError("bucket_fields_invalid", 400, { field: "kind" });
    }
    const row = rowValues(id, next, existing.archivedAt);
    tx.update(buckets).set({ ...withoutId(row), sortKey: foldName(row.name) }).where(eq(buckets.id, id)).run();
    const categoryIds = replaceCategories(tx, id, next.categoryIds);
    if (next.schedule && hasSchedule(next.kind)) {
      assertScheduleRefs(tx, next.kind, next.schedule);
      putSchedule(tx, id, next.schedule);
    }
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "update",
      before: snapshot(existing, beforeIds, beforeSchedule),
      after: snapshot(row, categoryIds, next.schedule),
    });
    return readBucket(tx, id);
  });
}

export function archiveBucket(db: Db, id: string, input: WriteInput): Bucket {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(buckets).where(eq(buckets.id, id)).get());
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
    const schedule = scheduleOf(tx, id);
    tx.delete(bucketCategories).where(eq(bucketCategories.bucketId, id)).run();
    const next = { ...existing, archivedAt: at };
    tx.update(buckets).set({ archivedAt: at }).where(eq(buckets.id, id)).run();
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "archive",
      before: snapshot(existing, categoryIds, schedule),
      after: snapshot(next, [], schedule),
    });
    return readBucket(tx, id);
  });
}

export function restoreBucket(db: Db, id: string, input: WriteInput): Bucket {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(buckets).where(eq(buckets.id, id)).get());
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (!existing.archivedAt) {
      throw new ServiceError("bucket_not_archived", 409);
    }
    const categoryIds = categoryIdsFor(tx, id);
    const schedule = scheduleOf(tx, id);
    const next = { ...existing, archivedAt: null };
    tx.update(buckets).set({ archivedAt: null }).where(eq(buckets.id, id)).run();
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: "restore",
      before: snapshot(existing, categoryIds, schedule),
      after: snapshot(next, categoryIds, schedule),
    });
    return readBucket(tx, id);
  });
}
