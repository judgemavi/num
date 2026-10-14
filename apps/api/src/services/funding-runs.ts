import { bucketEvents, buckets, fundingRuns, transactions, type FundingRunRow } from "@num/db";
import { fundingLimit, isIsoDate, utcNow, type FundingRun, type FundingRunCreate } from "@num/shared";
import { eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { activeFundingRun, fundingPosition, requirePaycheck } from "./funding-book";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";

/** The audit log keeps the run row without its id, and the lines of the run. */
function snapshot(row: FundingRunRow, lines: { bucketId: string; amount: number }[]) {
  return { ...withoutId(row), lines };
}

function linesOf(db: WriteTx | Db, runId: string) {
  return db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(eq(bucketEvents.fundingRunId, runId))
    .all();
}

function toRun(db: WriteTx | Db, row: FundingRunRow) {
  const txn = db.select({ payeeRaw: transactions.payeeRaw }).from(transactions).where(eq(transactions.id, row.incomeTransactionId)).get();
  const total = linesOf(db, row.id).reduce((sum, line) => sum + line.amount, 0);
  return {
    id: row.id,
    incomeTransactionId: row.incomeTransactionId,
    date: row.date,
    payee: txn?.payeeRaw ?? "",
    total,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
  };
}

function assertLines(tx: WriteTx, lines: FundingRunCreate["lines"], limit: number) {
  const seen = new Set<string>();
  let sum = 0;
  for (const line of lines) {
    if (seen.has(line.bucketId) || !Number.isSafeInteger(line.amount) || line.amount < 1) {
      throw new ServiceError("funding_lines_invalid", 400);
    }
    seen.add(line.bucketId);
    const bucket = tx.select().from(buckets).where(eq(buckets.id, line.bucketId)).get();
    if (!bucket) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (bucket.archivedAt) {
      throw new ServiceError("bucket_archived", 409);
    }
    sum += line.amount;
  }
  if (sum > limit) {
    throw new ServiceError("funding_over_limit", 409);
  }
}

export function createFundingRun(db: Db, input: FundingRunCreate & WriteInput & { asOf: string }): FundingRun {
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const paycheck = requirePaycheck(tx, input.incomeTransactionId);
    if (activeFundingRun(tx, paycheck.incomeTransactionId)) {
      throw new ServiceError("funding_run_exists", 409);
    }
    const position = fundingPosition(tx, input.asOf);
    assertLines(tx, input.lines, fundingLimit(paycheck.amount, position.unassigned));
    const id = crypto.randomUUID();
    const row: FundingRunRow = {
      id,
      incomeTransactionId: paycheck.incomeTransactionId,
      date: paycheck.date,
      createdAt: at,
      undoneAt: null,
    };
    tx.insert(fundingRuns).values(row).run();
    const lines = input.lines.map((line) => ({ bucketId: line.bucketId, amount: line.amount }));
    tx.audit({
      entity: "funding_runs",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row, lines),
    });
    for (const line of lines) {
      const eventId = crypto.randomUUID();
      const event = {
        id: eventId,
        kind: "fund" as const,
        bucketId: line.bucketId,
        otherBucketId: null,
        amount: line.amount,
        date: paycheck.date,
        note: null,
        fundingRunId: id,
        undoneAt: null,
      };
      tx.insert(bucketEvents).values(event).run();
      tx.audit({
        entity: "bucket_events",
        entityId: eventId,
        action: "create",
        before: null,
        after: event,
      });
    }
    return toRun(tx, row);
  });
}

export function undoFundingRun(db: Db, id: string, input: WriteInput): FundingRun {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(fundingRuns).where(eq(fundingRuns.id, id)).get();
    if (!existing) {
      throw new ServiceError("funding_run_not_found", 404);
    }
    if (existing.undoneAt) {
      throw new ServiceError("funding_run_undone", 409);
    }
    const next = { ...existing, undoneAt: at };
    tx.update(fundingRuns).set({ undoneAt: at }).where(eq(fundingRuns.id, id)).run();
    const lines = linesOf(tx, id);
    tx.audit({
      entity: "funding_runs",
      entityId: id,
      action: "undo",
      before: snapshot(existing, lines),
      after: snapshot(next, lines),
    });
    return toRun(tx, next);
  });
}

function runTotals(db: Db) {
  const totals = new Map<string, number>();
  const rows = db
    .select({
      fundingRunId: bucketEvents.fundingRunId,
      total: sql<number>`coalesce(sum(${bucketEvents.amount}), 0)`,
    })
    .from(bucketEvents)
    .where(isNotNull(bucketEvents.fundingRunId))
    .groupBy(bucketEvents.fundingRunId)
    .all();
  for (const row of rows) {
    if (row.fundingRunId) {
      totals.set(row.fundingRunId, row.total);
    }
  }
  return totals;
}

export function listFundingRuns(db: Db): { items: FundingRun[] } {
  const totals = runTotals(db);
  const payees = new Map(
    db
      .select({ id: transactions.id, payeeRaw: transactions.payeeRaw })
      .from(transactions)
      .all()
      .map((row) => [row.id, row.payeeRaw]),
  );
  const items = db
    .select()
    .from(fundingRuns)
    .all()
    .map((row) => ({
      id: row.id,
      incomeTransactionId: row.incomeTransactionId,
      date: row.date,
      payee: payees.get(row.incomeTransactionId) ?? "",
      total: totals.get(row.id) ?? 0,
      createdAt: row.createdAt,
      undoneAt: row.undoneAt,
    }));
  items.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.id < right.id ? 1 : -1;
  });
  return { items };
}
