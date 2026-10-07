import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDatabase } from "@num/db";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export type Db = BunSQLiteDatabase;

export function createDb(sqlite: Database): Db {
  return drizzle(sqlite);
}

export function openAppDb(path = ".data/num.sqlite"): Db {
  mkdirSync(dirname(path), { recursive: true });
  return createDb(openDatabase(path));
}
