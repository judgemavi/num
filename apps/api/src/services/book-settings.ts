import { accounts, importBatches } from "@num/db";
import { and, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { decidedKeys } from "./decision-keys";

export function importFreshness(db: Db, asOf: string): { accountId: string; lastImportedOn: string | null }[] {
  const open = db.select({ id: accounts.id }).from(accounts).where(isNull(accounts.archivedAt)).all();
  const batches = db
    .select({ accountId: importBatches.accountId, importedOn: importBatches.importedOn })
    .from(importBatches)
    .where(isNull(importBatches.undoneAt))
    .all();
  const latest = new Map<string, string>();
  for (const batch of batches) {
    if (batch.importedOn > asOf) {
      continue;
    }
    const current = latest.get(batch.accountId);
    if (!current || current < batch.importedOn) {
      latest.set(batch.accountId, batch.importedOn);
    }
  }
  return open.map((account) => ({
    accountId: account.id,
    lastImportedOn: latest.get(account.id) ?? null,
  }));
}

/** Unreadable lines with no answer yet. */
export function openUnreadableKeys(db: Db): string[] {
  const batches = db
    .select({ id: importBatches.id, unreadableJson: importBatches.unreadableJson })
    .from(importBatches)
    .where(and(isNull(importBatches.undoneAt), sql`${importBatches.unreadableJson} <> '[]'`))
    .all();
  const decided = decidedKeys(db, "import_unreadable");
  return batches
    .flatMap((batch) => batch.unreadableJson.map((row) => `import_unreadable:${batch.id}:${row.line}`))
    .filter((key) => !decided.has(key));
}
