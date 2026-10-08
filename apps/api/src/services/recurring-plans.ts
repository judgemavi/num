import { accounts, categories, merchants, recurringPlans } from "@num/db";
import {
  Temporal,
  utcNow,
  type Plan,
  type PlanCreate,
  type PlanFrequency,
  type PlanKind,
  type PlanListQuery,
  type PlanUpdate,
} from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type PlanRow = typeof recurringPlans.$inferSelect;

type PlanFields = {
  name: string;
  kind: PlanKind;
  accountId: string;
  expectedAmount: number;
  tolerance: number;
  amountMode: Plan["amountMode"];
  categoryId: string | null;
  transferAccountId: string | null;
  merchantId: string | null;
  startDate: string;
  freq: PlanFrequency;
  interval: number;
  monthDay: number | null;
  businessDayShift: Plan["businessDayShift"];
  endDate: string | null;
  active: boolean;
  fundsBuckets: boolean;
};

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

export function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as PlanKind,
    accountId: row.accountId,
    expectedAmount: row.expectedAmount,
    tolerance: row.tolerance,
    amountMode: row.amountMode as Plan["amountMode"],
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    merchantId: row.merchantId,
    startDate: row.startDate,
    freq: row.freq as PlanFrequency,
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as Plan["businessDayShift"],
    endDate: row.endDate,
    active: row.active,
    fundsBuckets: row.fundsBuckets,
    archivedAt: row.archivedAt,
  };
}

function snapshot(row: {
  name: string;
  kind: string;
  accountId: string;
  expectedAmount: number;
  tolerance: number;
  amountMode: string;
  categoryId: string | null;
  transferAccountId: string | null;
  merchantId: string | null;
  startDate: string;
  freq: string;
  interval: number;
  monthDay: number | null;
  businessDayShift: string;
  endDate: string | null;
  active: boolean;
  fundsBuckets: boolean;
  archivedAt: string | null;
}) {
  return {
    name: row.name,
    kind: row.kind,
    accountId: row.accountId,
    expectedAmount: row.expectedAmount,
    tolerance: row.tolerance,
    amountMode: row.amountMode,
    categoryId: row.categoryId,
    transferAccountId: row.transferAccountId,
    merchantId: row.merchantId,
    startDate: row.startDate,
    freq: row.freq,
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift,
    endDate: row.endDate,
    active: row.active,
    fundsBuckets: row.fundsBuckets,
    archivedAt: row.archivedAt,
  };
}

function fieldsOf(input: PlanCreate | PlanUpdate): PlanFields {
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

function requirePlan(tx: WriteTx, id: string): PlanRow {
  const row = tx.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get();
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  return row;
}

export function getPlan(db: Db, id: string): Plan {
  const row = db.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get();
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  return toPlan(row);
}

export function listPlans(db: Db, query: PlanListQuery) {
  const rows = db
    .select()
    .from(recurringPlans)
    .all()
    .filter((row) => {
      if (query.archived ? row.archivedAt === null : row.archivedAt !== null) {
        return false;
      }
      if (query.kind && row.kind !== query.kind) {
        return false;
      }
      if (query.accountId && row.accountId !== query.accountId) {
        return false;
      }
      if (query.q && !row.name.toLowerCase().includes(query.q.toLowerCase())) {
        return false;
      }
      return true;
    })
    .map(toPlan);
  const dir = query.dir === "desc" ? -1 : 1;
  const sort = query.sort ?? "name";
  rows.sort((left, right) => {
    const field =
      sort === "startDate"
        ? compareText(left.startDate, right.startDate)
        : compareName(left.name, right.name);
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

export function createPlan(db: Db, input: PlanCreate & WriteInput): Plan {
  const id = crypto.randomUUID();
  const value = fieldsOf(input);
  const row = { id, ...value, archivedAt: null };
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertRefs(tx, value);
    tx.insert(recurringPlans).values(row).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row),
    });
  });
  return toPlan(row);
}

export function updatePlan(db: Db, id: string, input: PlanUpdate & WriteInput): Plan {
  const value = fieldsOf(input);
  let updated: Plan | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = requirePlan(tx, id);
    assertRefs(tx, value);
    const next = { ...value, archivedAt: existing.archivedAt };
    tx.update(recurringPlans).set(value).where(eq(recurringPlans.id, id)).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: id,
      action: "update",
      before: snapshot(existing),
      after: snapshot(next),
    });
    updated = toPlan({ id, ...next });
  });
  if (!updated) {
    throw new Error("Update did not return a plan");
  }
  return updated;
}

export function archivePlan(db: Db, id: string, input: WriteInput): Plan {
  const at = input.at ?? utcNow();
  let archived: Plan | undefined;
  write(db, { source: input.source, at }, (tx) => {
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
      before: snapshot(existing),
      after: snapshot(next),
    });
    archived = toPlan(next);
  });
  if (!archived) {
    throw new Error("Archive did not return a plan");
  }
  return archived;
}

export function restorePlan(db: Db, id: string, input: WriteInput): Plan {
  let restored: Plan | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
      before: snapshot(existing),
      after: snapshot(next),
    });
    restored = toPlan(next);
  });
  if (!restored) {
    throw new Error("Restore did not return a plan");
  }
  return restored;
}
