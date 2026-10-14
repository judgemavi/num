import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const migrations = join(import.meta.dir, "..", "migrations");

/** For migration tests: a database in `dir` that has all migrations before the migration `tag`. */
export function databaseBefore(dir: string, tag: string) {
  const old = join(dir, "old");
  mkdirSync(join(old, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(join(migrations, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((entry) => entry.tag === tag);
  if (index < 1) {
    throw new Error(`Migration ${tag} is missing`);
  }
  const kept = journal.entries.slice(0, index);
  writeFileSync(join(old, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  for (const entry of kept) {
    cpSync(join(migrations, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
  }
  const sqlite = new Database(join(dir, "num.sqlite"));
  migrate(drizzle(sqlite), { migrationsFolder: old });
  return sqlite;
}
