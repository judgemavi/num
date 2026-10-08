import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const migrationsFolder = join(import.meta.dir, "..", "migrations");

export function migrateDatabase(sqlite: Database) {
  sqlite.exec("pragma foreign_keys = off");
  try {
    migrate(drizzle(sqlite), { migrationsFolder });
  } finally {
    sqlite.exec("pragma foreign_keys = on");
  }
}
