import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { HygieneCheck } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { readHygiene } from "./hygiene";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-hygiene-review-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  try {
    run(db);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function account(db: Db, kind: "chequing" | "credit_card", name: string, openingBalance: number) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    ...(kind === "credit_card" ? { paymentPolicy: "full" as const } : {}),
    ...saved,
  });
}

function check<T extends HygieneCheck["code"]>(db: Db, asOf: string, code: T): Extract<HygieneCheck, { code: T }> {
  const found = readHygiene(db, asOf).checks.find((item) => item.code === code);
  if (!found || found.code !== code) {
    throw new Error(code);
  }
  return found as Extract<HygieneCheck, { code: T }>;
}

test("a cash account that was never imported does not fail", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 5_000);
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(true);
    expect(row.items).toEqual([{ accountId: cash.id, lastImportDate: null, ageDays: null, pass: true }]);
  });
});
