import { accounts, checkpoints, monthCloses, transactions } from "@num/db";
import {
  isIsoDate,
  isMonthKey,
  monthLastDay,
  Temporal,
  utcNow,
  type MonthDetail,
  type MonthList,
  type MonthStatus,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadMonthStory } from "./month-story";
import { effectiveOpeningDate } from "./opening-date";
import { homeOpenMonths, needsReviewMonths } from "./needs-review";
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
    .get();
  const txnMonth = earliest?.date?.slice(0, 7);
  if (txnMonth && txnMonth < start) {
    start = txnMonth;
  }
  for (const row of db.select({ id: accounts.id, openingDate: accounts.openingDate, onBudget: accounts.onBudget }).from(accounts).all()) {
    if (!row.onBudget) {
      continue;
    }
    const month = effectiveOpeningDate(db, row).slice(0, 7);
    if (month < start) {
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

function withReview(blockers: Blocker[], month: string, reviewMonths: ReadonlySet<string>, homeMonths: ReadonlySet<string>): Blocker[] {
  if (reviewMonths.has(month)) {
    blockers.push({ code: "needs_review", accountId: null });
  }
  if (homeMonths.has(month)) {
    blockers.push({ code: "home_open", accountId: null });
  }
  return blockers;
}

function endBlocker(month: string, asOf: string): Blocker[] {
  if (asOf > monthLastDay(month)) {
    return [];
  }
  return [{ code: "month_not_ended", accountId: null }];
}

export function blockersFor(db: Db, month: string, asOf: string): Blocker[] {
  const blockers = [
    ...endBlocker(month, asOf),
    ...accountBlockers(month, db.select().from(accounts).all(), db.select().from(checkpoints).all()),
  ];
  return withReview(blockers, month, needsReviewMonths(db, asOf), homeOpenMonths(db, asOf));
}

function isClosed(row: CloseRow | undefined): boolean {
  return row !== undefined;
}

function statusOf(closed: boolean, blockers: Blocker[]): MonthStatus {
  if (closed) {
    return "closed";
  }
  return blockers.length === 0 ? "ready" : "open";
}

function liveDetail(db: Db, month: string, asOf: string, blockers: Blocker[], closed = false): MonthDetail {
  return {
    asOf,
    month,
    status: statusOf(closed, blockers),
    blockers,
    story: loadMonthStory(db, month, asOf),
  };
}

export function listMonths(db: Db, asOf: string): MonthList {
  requireAsOf(asOf);
  const closes = new Map(db.select().from(monthCloses).all().map((row) => [row.month, row]));
  const accountRows = db.select().from(accounts).all();
  const checkpointRows = db.select().from(checkpoints).all();
  const reviewMonths = needsReviewMonths(db, asOf);
  const homeMonths = homeOpenMonths(db, asOf);
  return {
    asOf,
    items: monthsInBook(db, asOf).map((month) => {
      const blockers = withReview(
        [...endBlocker(month, asOf), ...accountBlockers(month, accountRows, checkpointRows)],
        month,
        reviewMonths,
        homeMonths,
      );
      return { month, status: statusOf(isClosed(closes.get(month)), blockers), blockers };
    }),
  };
}

export function closedStories(db: Db, months: readonly string[], asOf: string) {
  const wanted = new Set(months);
  const stories = new Map<string, MonthDetail["story"]>();
  if (wanted.size === 0) {
    return stories;
  }
  for (const row of db.select().from(monthCloses).all()) {
    if (!wanted.has(row.month)) {
      continue;
    }
    stories.set(row.month, loadMonthStory(db, row.month, asOf));
  }
  return stories;
}

export function readMonth(db: Db, month: string, asOf: string): MonthDetail {
  requireListedMonth(db, month, asOf);
  const row = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  const blockers = blockersFor(db, month, asOf);
  return liveDetail(db, month, asOf, blockers, isClosed(row));
}

export function closeMonth(db: Db, month: string, asOf: string, input: WriteInput): MonthDetail {
  requireListedMonth(db, month, asOf);
  const existing = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  if (isClosed(existing)) {
    throw new ServiceError("month_closed", 409, { month });
  }
  const blockers = blockersFor(db, month, asOf);
  if (blockers.some((item) => item.code === "month_not_ended")) {
    throw new ServiceError("month_not_ended", 409, { month });
  }
  if (blockers.length > 0) {
    throw new ServiceError("month_not_ready", 409, { month, blocker: blockers[0]?.code ?? "month_not_ready" });
  }
  const at = input.at ?? utcNow();
  const row = { month, closedAt: at };
  write(db, { source: input.source, at }, (tx) => {
    tx.delete(monthCloses).where(eq(monthCloses.month, month)).run();
    tx.insert(monthCloses).values(row).run();
    tx.audit({
      entity: "month_close",
      entityId: month,
      action: "close",
      before: existing ? { month: existing.month, closedAt: existing.closedAt } : null,
      after: row,
    });
  });
  return liveDetail(db, month, asOf, [], true);
}

export function reopenMonth(db: Db, month: string, asOf: string, input: WriteInput): MonthDetail {
  requireListedMonth(db, month, asOf);
  const existing = db.select().from(monthCloses).where(eq(monthCloses.month, month)).get();
  if (!existing) {
    throw new ServiceError("month_not_closed", 409, { month });
  }
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    tx.delete(monthCloses).where(eq(monthCloses.month, month)).run();
    tx.audit({
      entity: "month_close",
      entityId: month,
      action: "reopen",
      before: { month: existing.month, closedAt: existing.closedAt },
      after: null,
    });
  });
  return liveDetail(db, month, asOf, blockersFor(db, month, asOf));
}
