import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { ErrorCode } from "@num/shared";
import { expect } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";

export function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-test-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    dir,
    db,
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}
