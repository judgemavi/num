import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDatabase } from "@num/db";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export type Db = BunSQLiteDatabase;

export function createDb(sqlite: Database): Db {
  return drizzle(sqlite);
}

export function dataDirectory(dataDir: string | undefined): string {
  const root = join(import.meta.dir, "..", "..", "..");
  const value = dataDir?.trim() ?? "";
  if (value.length === 0) {
    return join(root, ".data");
  }
  return resolve(root, value);
}

export function openAppDb(dataDir: string | undefined): { sqlite: Database; db: Db } {
  const dir = dataDirectory(dataDir);
  mkdirSync(dir, { recursive: true });
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  return { sqlite, db: createDb(sqlite) };
}
