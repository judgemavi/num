import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merchants, migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { archiveMerchant, createMerchant, listMerchants, updateMerchant } from "./merchants";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-merchants-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const first = { page: 1, pageSize: 50 };

function names(db: ReturnType<typeof createDb>, query: Parameters<typeof listMerchants>[1]) {
  return listMerchants(db, query).items.map((item) => item.name);
}

test("the list sorts an accented name with its plain letters, and pages in SQL", () => {
  const { db, close } = tempDatabase();
  try {
    for (const name of ["Fable", "École", "Eagle", "zebra", "Apple"]) {
      createMerchant(db, { name, ...saved });
    }
    expect(names(db, { ...first, archived: false })).toEqual(["Apple", "Eagle", "École", "Fable", "zebra"]);
    expect(names(db, { ...first, archived: false, dir: "desc" })).toEqual(["zebra", "Fable", "École", "Eagle", "Apple"]);
    const second = listMerchants(db, { page: 2, pageSize: 2, archived: false });
    expect(second.items.map((item) => item.name)).toEqual(["École", "Fable"]);
    expect(second.total).toBe(5);
  } finally {
    close();
  }
});

test("a rename writes the new sort key, and the list shows archived merchants apart", () => {
  const { db, close } = tempDatabase();
  try {
    const moved = createMerchant(db, { name: "Zed", ...saved });
    createMerchant(db, { name: "Eagle", ...saved });
    const old = createMerchant(db, { name: "Old", ...saved });
    updateMerchant(db, moved.id, { name: "Émile", ...saved });
    expect(db.select({ key: merchants.sortKey }).from(merchants).where(eq(merchants.id, moved.id)).get()).toEqual({ key: "emile" });
    expect(names(db, { ...first, archived: false })).toEqual(["Eagle", "Émile", "Old"]);
    archiveMerchant(db, old.id, saved);
    expect(names(db, { ...first, archived: false })).toEqual(["Eagle", "Émile"]);
    const archived = listMerchants(db, { ...first, archived: true });
    expect(archived.items.map((item) => item.name)).toEqual(["Old"]);
    expect(archived.total).toBe(1);
    expect(Object.keys(archived.items[0] ?? {}).sort()).toEqual(["archivedAt", "id", "name"]);
  } finally {
    close();
  }
});
