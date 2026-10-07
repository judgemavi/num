import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const migrationsFolder = join(import.meta.dir, "..", "migrations");

export function migrateDatabase(sqlite: Database) {
  migrate(drizzle(sqlite), { migrationsFolder });
}
