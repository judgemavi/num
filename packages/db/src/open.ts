import { Database } from "bun:sqlite";

export function openDatabase(path: string): Database {
  const sqlite = new Database(path, { create: true });
  sqlite.exec("pragma foreign_keys = on");
  sqlite.exec("pragma journal_mode = wal");
  sqlite.exec("pragma busy_timeout = 5000");
  sqlite.exec("pragma synchronous = normal");
  return sqlite;
}
