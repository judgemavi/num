import { accounts, checkpoints, forecastSnapshots, monthCloses, transactions } from "@num/db";
import {
  isIsoDate,
  isMonthKey,
  monthLastDay,
  monthStorySchema,
  Temporal,
  utcNow,
  type MonthDetail,
  type MonthList,
  type MonthStatus,
} from "@num/shared";
import { eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listInbox } from "./inbox";
import { loadMonthStory, onBudgetTotal } from "./month-story";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type Blocker = MonthDetail["blockers"][number];
type CloseRow = typeof monthCloses.$inferSelect;

function requireAsOf(asOf: string) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
}

function monthsInBook(db: Db, asOf: string): string[] {
  const end = asOf.slice(0, 7);
  let start = end;
  const earliest = db
    .select({ date: sql<string | null>`min(${transactions.date})` })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .get();
  const txnMonth = earliest?.date?.slice(0, 7);
  if (txnMonth && txnMonth < start) {
    start = txnMonth;
  }
  for (const row of db.select({ openingDate: accounts.openingDate, onBudget: accounts.onBudget }).from(accounts).all()) {
    const month = row.openingDate.slice(0, 7);
    if (row.onBudget && month < start) {
      start = month;
    }
  }
  for (const row of db.select({ month: monthCloses.month }).from(monthCloses).all()) {
    if (row.month < start) {
      start = row.month;
    }
  }
  const items: string[] = [];
  let cursor = Temporal.PlainDate.from(`${start}-01`);
  const last = Temporal.PlainDate.from(`${end}-01`);
  while (Temporal.PlainDate.compare(cursor, last) <= 0) {
    items.push(cursor.toString().slice(0, 7));
    cursor = cursor.add({ months: 1 });
  }
  return items.reverse();
}

function requireListedMonth(db: Db, month: string, asOf: string): string[] {
  requireAsOf(asOf);
  if (!isMonthKey(month)) {
    throw new ServiceError("month_invalid", 400, { month });
  }
  const months = monthsInBook(db, asOf);
  if (!months.includes(month)) {
    throw new ServiceError("month_not_found", 404, { month });
  }
  return months;
}

function accountBlockers(
  month: string,
  accountRows: readonly { id: string; onBudget: boolean; archivedAt: string | null }[],
  checkpointRows: readonly { accountId: string; date: string; unlockedAt: string | null }[],
): Blocker[] {
  const end = monthLastDay(month);
  const covered = new Set(
    checkpointRows.filter((row) => row.unlockedAt === null && row.date >= end).map((row) => row.accountId),
  );
  return accountRows
    .filter((row) => row.onBudget && row.archivedAt === null && !covered.has(row.id))
    .map((row) => ({ code: "checkpoint_missing" as const, accountId: row.id }))
    .sort((left, right) => ((left.accountId ?? "") < (right.accountId ?? "") ? -1 : 1));
}

export function blockersFor(db: Db, month: string, asOf: string): Blocker[] {
  const blockers = accountBlockers(month, db.select().from(accounts).all(), db.select().from(checkpoints).all());
  if (listInbox(db, asOf).items.some((item) => item.date.startsWith(`${month}-`))) {
    blockers.push({ code: "inbox_open", accountId: null });
  }
  return blockers;
}

function isClosed(row: CloseRow | undefined): boolean {
  return row !== undefined && row.reopenedAt === null;
}

function statusOf(closed: boolean, blockers: Blocker[]): MonthStatus {
  if (closed) {
    return "closed";
  }
  return blockers.length === 0 ? "ready" : "open";
}

function accuracyOf(db: Db, month: string, asOf: string): MonthDetail["story"]["accuracy"] {
  const snapshot = db.select().from(forecastSnapshots).where(eq(forecastSnapshots.month, month)).get();
  if (!snapshot) {
    return null;
  }
  const through = asOf < monthLastDay(month) ? asOf : monthLastDay(month);
  return { predicted: snapshot.predictedTotal, actual: onBudgetTotal(db, through) };
}

function liveDetail(db: Db, month: string, asOf: string, blockers: Blocker[]): MonthDetail {
  return {
    asOf,
    month,
    status: statusOf(false, blockers),
    blockers,
    story: loadMonthStory(db, month, asOf, accuracyOf(db, month, asOf)),
  };
}

export function listMonths(db: Db, asOf: string): MonthList {
  requireAsOf(asOf);
  const closes = new Map(db.select().from(monthCloses).all().map((row) => [row.month, row]));
  const accountRows = db.select().from(accounts).all();
  const checkpointRows = db.select().from(checkpoints).all();
  const inboxMonths = new Set(listInbox(db, asOf).items.map((item) => item.date.slice(0, 7)));
  return {
    asOf,
    items: monthsInBook(db, asOf).map((month) => {
      const blockers = accountBlockers(month, accountRows, checkpointRows);
      if (inboxMonths.has(month)) {
        blockers.push({ code: "inbox_open", accountId: null });
      }
      return { month, status: statusOf(isClosed(closes.get(month)), blockers), blockers };
    }),
  };
}

export function readMonth(db: Db, month: string, asOf: string): MonthDetail {
  requireListedMonth(db, month, asOf);
  const row = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  const blockers = blockersFor(db, month, asOf);
  if (!isClosed(row) || !row) {
    return liveDetail(db, month, asOf, blockers);
  }
  return {
    asOf,
    month,
    status: "closed",
    blockers,
    story: monthStorySchema.parse(JSON.parse(row.summaryJson)),
  };
}

export function closeMonth(db: Db, month: string, asOf: string, input: WriteInput): MonthDetail {
  requireListedMonth(db, month, asOf);
  const existing = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  if (isClosed(existing)) {
    throw new ServiceError("month_closed", 409, { month });
  }
  const blockers = blockersFor(db, month, asOf);
  if (blockers.length > 0) {
    throw new ServiceError("month_not_ready", 409, { month, blocker: blockers[0]?.code ?? "month_not_ready" });
  }
  const story = loadMonthStory(db, month, asOf, accuracyOf(db, month, asOf));
  const at = input.at ?? utcNow();
  const row = {
    month,
    closedAt: at,
    reopenedAt: null,
    reopenReason: null,
    summaryJson: JSON.stringify(story),
  };
  write(db, { source: input.source, at }, (tx) => {
    if (existing) {
      tx.update(monthCloses).set(row).where(eq(monthCloses.month, month)).run();
    } else {
      tx.insert(monthCloses).values(row).run();
    }
    tx.audit({
      entity: "month_close",
      entityId: month,
      action: "close",
      before: existing ?? null,
      after: row,
    });
  });
  return { asOf, month, status: "closed", blockers: [], story };
}

export function reopenMonth(db: Db, month: string, asOf: string, reason: string, input: WriteInput): MonthDetail {
  requireListedMonth(db, month, asOf);
  const existing = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  if (!isClosed(existing) || !existing) {
    throw new ServiceError("month_not_closed", 409, { month });
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("reopen_reason_required", 400, { field: "reason" });
  }
  const at = input.at ?? utcNow();
  const row = { ...existing, reopenedAt: at, reopenReason: trimmed };
  write(db, { source: input.source, at }, (tx) => {
    tx.update(monthCloses).set({ reopenedAt: at, reopenReason: trimmed }).where(eq(monthCloses.month, month)).run();
    tx.audit({
      entity: "month_close",
      entityId: month,
      action: "reopen",
      before: existing,
      after: row,
    });
  });
  return liveDetail(db, month, asOf, blockersFor(db, month, asOf));
}
