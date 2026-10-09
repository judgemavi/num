import { accounts, importBatches, settings } from "@num/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { readUnreadable } from "./import-read";

export function settingNumber(
  db: Db,
  key: "staleImportDays" | "recurringGraceDays" | "emergencyFundMonths",
  fallback: number,
): number {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  const value = Number(row?.value ?? String(fallback));
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function importFreshness(db: Db, asOf: string): { accountId: string; lastImportAt: string | null }[] {
  const open = db.select({ id: accounts.id }).from(accounts).where(isNull(accounts.archivedAt)).all();
  const batches = db
    .select({ accountId: importBatches.accountId, createdAt: importBatches.createdAt })
    .from(importBatches)
    .where(isNull(importBatches.undoneAt))
    .all();
  const latest = new Map<string, string>();
  for (const batch of batches) {
    if (batch.createdAt.slice(0, 10) > asOf) {
      continue;
    }
    const current = latest.get(batch.accountId);
    if (!current || current < batch.createdAt) {
      latest.set(batch.accountId, batch.createdAt);
    }
  }
  return open.map((account) => ({
    accountId: account.id,
    lastImportAt: latest.get(account.id) ?? null,
  }));
}

export function openUnreadableKeys(db: Db): string[] {
  const batches = db
    .select({ id: importBatches.id, unreadableJson: importBatches.unreadableJson })
    .from(importBatches)
    .where(and(isNull(importBatches.undoneAt), sql`${importBatches.unreadableJson} <> '[]'`))
    .all();
  return batches.flatMap((batch) => readUnreadable(batch.unreadableJson).map((row) => `import_unreadable:${batch.id}:${row.line}`));
}
