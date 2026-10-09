import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, migrateDatabase, openDatabase, transactions } from "@num/db";
import { storedPayee } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { defaultCategoryGroups } from "./default-categories";
import { changeCurrency, runSetup } from "./setup";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-setup-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const at = "2026-10-07T16:00:00Z";

function categoryNames(): string[] {
  return defaultCategoryGroups.flatMap((group) => group.categories.map((category) => category.name));
}

function names(sqlite: ReturnType<typeof tempDatabase>["sqlite"], table: string): string[] {
  const rows = sqlite.query(`select name from ${table} order by name`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

test("setup runs only one time", () => {
  const db = tempDatabase();
  try {
    const first = runSetup(db.db, { currency: "CAD", categorySet: "default", source: "ui", at });
    expect(first).toEqual({ currency: "CAD", categorySet: "default" });
    expect(names(db.sqlite, "categories").sort()).toEqual(categoryNames().sort());
    expect(db.sqlite.query("select id from accounts").all()).toEqual([]);
    expect(db.sqlite.query("select key, value from settings order by key").all()).toEqual([
      { key: "autoConfidence", value: "balanced" },
      { key: "bufferAmount", value: "0" },
      { key: "currency", value: "CAD" },
      { key: "emergencyFundMonths", value: "3" },
      { key: "recurringGraceDays", value: "3" },
      { key: "staleImportDays", value: "10" },
    ]);

    expect(() =>
      runSetup(db.db, { currency: "JPY", categorySet: "none", source: "ui", at }),
    ).toThrow(ServiceError);
    try {
      runSetup(db.db, { currency: "JPY", categorySet: "none", source: "ui", at });
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      if (error instanceof ServiceError) {
        expect(error.code).toBe("setup_already_complete");
      }
    }
    expect(db.sqlite.query("select value from settings where key = 'currency'").get()).toEqual({
      value: "CAD",
    });
    expect(names(db.sqlite, "categories").sort()).toEqual(categoryNames().sort());
  } finally {
    db.close();
  }
});

test("a book can start with no categories", () => {
  const db = tempDatabase();
  try {
    runSetup(db.db, { currency: "JPY", categorySet: "none", source: "ui", at });
    expect(db.sqlite.query("select id from categories").all()).toEqual([]);
    expect(db.sqlite.query("select id from category_groups").all()).toEqual([]);
    expect(db.sqlite.query("select id from accounts").all()).toEqual([]);
  } finally {
    db.close();
  }
});

test("currency cannot change after the first transaction", () => {
  const db = tempDatabase();
  try {
    runSetup(db.db, { currency: "JPY", categorySet: "none", source: "ui", at });
    expect(changeCurrency(db.db, { currency: "CAD", source: "ui", at })).toEqual({ currency: "CAD" });

    const accountId = crypto.randomUUID();
    db.db
      .insert(accounts)
      .values({
        id: accountId,
        name: "Cash",
        kind: "cash",
        onBudget: true,
        openingDate: "2026-01-01",
        openingBalance: 0,
      })
      .run();
    db.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        accountId,
        date: "2026-01-02",
        amount: -100,
        ...storedPayee("Shop"),
        status: "open",
        source: "manual",
      })
      .run();

    try {
      changeCurrency(db.db, { currency: "KWD", source: "ui", at });
      throw new Error("currency change should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      if (error instanceof ServiceError) {
        expect(error.code).toBe("currency_locked");
      }
    }
    expect(db.sqlite.query("select value from settings where key = 'currency'").get()).toEqual({
      value: "CAD",
    });
  } finally {
    db.close();
  }
});
