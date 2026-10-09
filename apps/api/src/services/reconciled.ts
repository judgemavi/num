import { checkpoints } from "@num/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

export function latestCheckpointDate(db: Reader, accountId: string): string | null {
  const row = db
    .select({ date: sql<string | null>`max(${checkpoints.date})` })
    .from(checkpoints)
    .where(and(eq(checkpoints.accountId, accountId), isNull(checkpoints.unlockedAt)))
    .get();
  return row?.date ?? null;
}

export function dateIsReconciled(date: string, checkpointDate: string | null): boolean {
  return checkpointDate !== null && date <= checkpointDate;
}

export function transactionReconciled(db: Reader, accountId: string, date: string): boolean {
  return dateIsReconciled(date, latestCheckpointDate(db, accountId));
}
