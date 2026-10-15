import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { ErrorCode } from "@num/shared";
import { expect } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";

export function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-buckets-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    dir,
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const at = "2026-10-07T16:00:00Z";
export const saved = { source: "ui" as const, at };

export function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

export function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", source: "ui", at });
}

export function spending(db: Db, name: string, categoryIds: string[], refillTo = 100_000) {
  return createBucket(db, {
    name,
    kind: "spending",
    priority: 1,
    essential: false,
    color: "mint",
    icon: "shopping-cart",
    categoryIds,
    refillTo,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    canRecede: null,
    schedule: null,
    asOf: "2000-01-01",
    ...saved,
  });
}

export function purchase(db: Db, accountId: string, categoryId: string, amount: number, date = "2026-03-01") {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}
