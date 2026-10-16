import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { z } from "zod";

const migrationsFolder = join(import.meta.dir, "..", "migrations");

const journalSchema = z.object({ entries: z.array(z.object({ tag: z.string().min(1) })) });

function migrationHash(tag: string) {
  const sql = readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8");
  return createHash("sha256").update(sql).digest("hex");
}

function assertJournalApplied(sqlite: Database) {
  const journal = journalSchema.parse(JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")));
  const applied = new Set(
    sqlite
      .query<{ hash: string }, []>("select hash from __drizzle_migrations")
      .all()
      .map((row) => row.hash),
  );
  for (const entry of journal.entries) {
    if (!applied.has(migrationHash(entry.tag))) {
      throw new Error(
        `Migration ${entry.tag} is missing. This database was migrated by a different version; restore a backup or start a new database.`,
      );
    }
  }
}

export function migrateDatabase(sqlite: Database) {
  sqlite.exec("pragma foreign_keys = off");
  try {
    migrate(drizzle(sqlite), { migrationsFolder });
    const violations = sqlite.query("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`Foreign key check failed: ${violations.length} rows`);
    }
    assertJournalApplied(sqlite);
  } finally {
    sqlite.exec("pragma foreign_keys = on");
  }
}
