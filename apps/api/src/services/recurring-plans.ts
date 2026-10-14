import { accounts, categories, merchants, recurringPlans, type RecurringPlanRow } from "@num/db";
import {
  foldName,
  Temporal,
  utcNow,
  type Plan,
  type PlanCreate,
  type PlanKind,
  type PlanListQuery,
  type PlanUpdate,
} from "@num/shared";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { keepOmitted, withoutId, write, type WriteTx, type WriteInput } from "./write";
import { byColumn, byName, pagedOf, totalOf, windowOf, withoutSortKey } from "./list-sql";

function fieldsOf(input: PlanCreate) {
  const transfer = input.kind === "transfer";
  return {
    name: input.name.trim(),
    kind: input.kind,
    accountId: input.accountId,
    expectedAmount: input.expectedAmount,
    tolerance: input.tolerance,
    amountMode: input.amountMode,
    categoryId: transfer ? null : (input.categoryId ?? null),
    transferAccountId: transfer ? (input.transferAccountId ?? null) : null,
    merchantId: input.merchantId ?? null,
    startDate: input.startDate,
    freq: input.freq,
    interval: input.interval,
    monthDay: input.freq === "weekly" ? null : (input.monthDay ?? null),
    businessDayShift: input.businessDayShift,
    endDate: input.endDate ?? null,
    active: input.active,
    fundsBuckets: input.kind === "income" ? input.fundsBuckets : false,
  };
}

type PlanFields = ReturnType<typeof fieldsOf>;

function assertFields(value: PlanFields) {
  if (value.kind === "transfer") {
    if (!value.transferAccountId || value.transferAccountId === value.accountId || value.categoryId) {
      throw new ServiceError("plan_fields_invalid", 400, { field: "transferAccountId" });
    }
  } else if (value.transferAccountId) {
    throw new ServiceError("plan_fields_invalid", 400, { field: "transferAccountId" });
  }
  if (value.freq === "weekly" && value.monthDay !== null) {
    throw new ServiceError("plan_fields_invalid", 400, { field: "monthDay" });
  }
  if (value.fundsBuckets && value.kind !== "income") {
    throw new ServiceError("plan_fields_invalid", 400, { field: "fundsBuckets" });
  }
  if (value.endDate && Temporal.PlainDate.compare(value.endDate, value.startDate) < 0) {
    throw new ServiceError("plan_fields_invalid", 400, { field: "endDate" });
  }
}

function assertAccount(tx: WriteTx, id: string) {
  const row = tx.select({ id: accounts.id, archivedAt: accounts.archivedAt }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("account_archived", 409);
  }
}

function assertCategory(tx: WriteTx, id: string, kind: PlanKind) {
  const row = tx
    .select({ kind: categories.kind, archivedAt: categories.archivedAt })
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("category_archived", 409);
  }
  const expected = kind === "income" ? "income" : "expense";
  if (kind === "transfer" || row.kind !== expected) {
    throw new ServiceError("plan_fields_invalid", 400, { field: "categoryId" });
  }
}

function assertMerchant(tx: WriteTx, id: string) {
  const row = tx.select({ archivedAt: merchants.archivedAt }).from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("merchant_archived", 409);
  }
}

function assertRefs(tx: WriteTx, value: PlanFields) {
  assertFields(value);
  assertAccount(tx, value.accountId);
  if (value.transferAccountId) {
    assertAccount(tx, value.transferAccountId);
  }
  if (value.categoryId) {
    assertCategory(tx, value.categoryId, value.kind);
  }
  if (value.merchantId) {
    assertMerchant(tx, value.merchantId);
  }
}

function requirePlan(tx: WriteTx, id: string): Omit<RecurringPlanRow, "sortKey"> {
  const row = withoutSortKey(tx.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get());
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  return row;
}

export function getPlan(db: Db, id: string): Plan {
  const row = withoutSortKey(db.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get());
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  return row;
}

export function listPlans(db: Db, query: PlanListQuery) {
  const where = and(
    query.archived ? isNotNull(recurringPlans.archivedAt) : isNull(recurringPlans.archivedAt),
    query.kind ? eq(recurringPlans.kind, query.kind) : undefined,
    query.accountId ? eq(recurringPlans.accountId, query.accountId) : undefined,
    query.q ? sql`instr(${recurringPlans.sortKey}, ${foldName(query.q)}) > 0` : undefined,
  );
  const order =
    query.sort === "startDate" ? byColumn(recurringPlans.startDate, recurringPlans.id, query.dir) : byName(recurringPlans, query.dir);
  const { limit, offset } = windowOf(query);
  const rows = db.select().from(recurringPlans).where(where).orderBy(...order).limit(limit).offset(offset).all();
  return pagedOf(rows.map((row) => withoutSortKey(row)), totalOf(db, recurringPlans, where), query);
}

export function createPlan(db: Db, input: PlanCreate & WriteInput): Plan {
  const id = crypto.randomUUID();
  const value = fieldsOf(input);
  const row = { id, ...value, archivedAt: null };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertRefs(tx, value);
    tx.insert(recurringPlans).values({ ...row, sortKey: foldName(row.name) }).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
  });
  return row;
}

/** A field that the update leaves out keeps its stored value. An explicit null clears a field that can be empty. */
export function updatePlan(db: Db, id: string, input: PlanUpdate & WriteInput): Plan {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = requirePlan(tx, id);
    const value = fieldsOf({
      ...input,
      categoryId: keepOmitted(input.categoryId, existing.categoryId),
      transferAccountId: keepOmitted(input.transferAccountId, existing.transferAccountId),
      merchantId: keepOmitted(input.merchantId, existing.merchantId),
      monthDay: keepOmitted(input.monthDay, existing.monthDay),
      endDate: keepOmitted(input.endDate, existing.endDate),
      active: keepOmitted(input.active, existing.active),
      fundsBuckets: keepOmitted(input.fundsBuckets, existing.fundsBuckets),
    });
    assertRefs(tx, value);
    const next = { ...value, archivedAt: existing.archivedAt };
    tx.update(recurringPlans).set({ ...value, sortKey: foldName(value.name) }).where(eq(recurringPlans.id, id)).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "update",
      before: withoutId(existing),
      after: next,
    });
    return { id, ...next };
  });
}

export function archivePlan(db: Db, id: string, input: WriteInput): Plan {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = requirePlan(tx, id);
    if (existing.archivedAt) {
      throw new ServiceError("plan_archived", 409);
    }
    const next = { ...existing, archivedAt: at };
    tx.update(recurringPlans).set({ archivedAt: at }).where(eq(recurringPlans.id, id)).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "archive",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}

export function restorePlan(db: Db, id: string, input: WriteInput): Plan {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = requirePlan(tx, id);
    if (!existing.archivedAt) {
      throw new ServiceError("plan_not_archived", 409);
    }
    const next = { ...existing, archivedAt: null };
    tx.update(recurringPlans).set({ archivedAt: null }).where(eq(recurringPlans.id, id)).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "restore",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}
