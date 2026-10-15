import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { createAccount, listAccounts } from "./accounts";
import { createBucket, listBuckets } from "./buckets";
import { createCategory, createCategoryGroup, listCategories, listCategoryGroups, updateCategory } from "./categories";
import { createTag, listTags } from "./tags";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };
const names = ["Fable", "École", "Eagle"];
const sorted = ["Eagle", "École", "Fable"];
const first = { page: 1, pageSize: 50, archived: false };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-name-lists-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("accounts, categories, groups and tags sort an accented name with its plain letters", () => {
  const { db, close } = tempDatabase();
  try {
    for (const name of names) {
      createAccount(db, { name, institution: null, kind: "chequing", openingBalance: 0, ...saved });
      createCategory(db, { name, kind: "expense", ...saved });
      createCategoryGroup(db, { name, ...saved });
      createTag(db, { name, ...saved });
    }
    expect(listAccounts(db, first).items.map((item) => item.name)).toEqual(sorted);
    expect(listAccounts(db, { ...first, dir: "desc", pageSize: 2 }).items.map((item) => item.name)).toEqual(["Fable", "École"]);
    expect(listAccounts(db, { ...first, sort: "kind" }).total).toBe(3);
    expect(Object.keys(listAccounts(db, first).items[0] ?? {})).not.toContain("createdAt");
    expect(Object.keys(listAccounts(db, first).items[0] ?? {})).not.toContain("sortKey");
    expect(listCategories(db, first).items.map((item) => item.name)).toEqual(sorted);
    expect(listCategories(db, { ...first, page: 2, pageSize: 2 })).toMatchObject({ total: 3, items: [{ name: "Fable" }] });
    expect(listCategoryGroups(db).items.map((item) => item.name)).toEqual(sorted);
    expect(listTags(db, first).items.map((item) => item.name)).toEqual(sorted);
    expect(Object.keys(listTags(db, first).items[0] ?? {}).sort()).toEqual(["archivedAt", "id", "name"]);
  } finally {
    close();
  }
});

test("a category rename writes the new sort key", () => {
  const { db, close } = tempDatabase();
  try {
    const moved = createCategory(db, { name: "Zed", kind: "expense", ...saved });
    createCategory(db, { name: "Eagle", kind: "expense", ...saved });
    updateCategory(db, moved.id, { name: "Émile", kind: "expense", groupId: null, essential: false, ...saved });
    expect(listCategories(db, first).items.map((item) => item.name)).toEqual(["Eagle", "Émile"]);
  } finally {
    close();
  }
});

test("buckets sort by the folded name", () => {
  const { db, close } = tempDatabase();
  try {
    for (const name of names) {
      createBucket(db, {
        name,
        kind: "spending",
        priority: 1,
        essential: false,
        color: "mint",
        icon: "shopping-cart",
        categoryIds: [],
        refillTo: 1000,
        amount: null,
        dueDate: null,
        repeat: null,
        target: null,
        targetDate: null,
        fixedAmount: null,
        months: null,
        schedule: null,
        asOf: "2000-01-01",
        ...saved,
      });
    }
    expect(listBuckets(db, { ...first, sort: "name" }).items.map((item) => item.name)).toEqual(sorted);
  } finally {
    close();
  }
});
