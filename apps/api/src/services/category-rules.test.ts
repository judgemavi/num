import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  accounts,
  bucketCategories,
  buckets,
  migrateDatabase,
  openDatabase,
  transactionLines,
  transactions,
} from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import {
  archiveCategory,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  listCategories,
  listCategoryGroups,
  restoreCategory,
  updateCategory,
  updateCategoryGroup,
} from "./categories";
import { archiveTag, createTag, restoreTag, updateTag } from "./tags";
import type { ErrorCode } from "@num/shared";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-names-"));
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

const at = "2026-10-07T16:00:00Z";

function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

test("category and tag names stay unique when the case differs", () => {
  const book = tempDatabase();
  try {
    const category = createCategory(book.db, {
      name: "Groceries",
      kind: "expense",
      essential: true,
      source: "ui",
      at,
    });
    expectCode(
      () => createCategory(book.db, { name: "groceries", kind: "expense", source: "ui", at }),
      "category_name_taken",
    );
    const renamed = updateCategory(book.db, category.id, {
      name: "GROCERIES",
      kind: "expense",
      groupId: null,
      essential: true,
      source: "ui",
      at,
    });
    expect(renamed.name).toBe("GROCERIES");

    const tag = createTag(book.db, { name: "Trip", source: "ui", at });
    expectCode(() => createTag(book.db, { name: "trip", source: "ui", at }), "tag_name_taken");
    expect(updateTag(book.db, tag.id, { name: "TRIP", source: "ui", at }).name).toBe("TRIP");
  } finally {
    book.close();
  }
});

test("only an expense category can be essential", () => {
  const book = tempDatabase();
  try {
    expectCode(
      () => createCategory(book.db, { name: "Pay", kind: "income", essential: true, source: "ui", at }),
      "essential_expense_only",
    );
    const pay = createCategory(book.db, { name: "Pay", kind: "income", source: "ui", at });
    expect(pay.essential).toBe(false);
    expectCode(
      () =>
        updateCategory(book.db, pay.id, {
          name: "Pay",
          kind: "income",
          groupId: null,
          essential: true,
          source: "ui",
          at,
        }),
      "essential_expense_only",
    );
  } finally {
    book.close();
  }
});

const write = { source: "ui" as const, at };

function addLine(db: ReturnType<typeof tempDatabase>["db"], categoryId: string) {
  const accountId = crypto.randomUUID();
  db.insert(accounts)
    .values({
      id: accountId,
      name: "Cash",
      kind: "chequing",
      onBudget: true,
      openingDate: "2026-01-01",
      openingBalance: 0,
    })
    .run();
  const transactionId = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id: transactionId,
      accountId,
      date: "2026-03-01",
      amount: -100,
      payeeRaw: "Example shop",
      status: "cleared",
      source: "manual",
    })
    .run();
  db.insert(transactionLines)
    .values({
      id: crypto.randomUUID(),
      transactionId,
      amount: -100,
      categoryId,
    })
    .run();
}

function addBucket(db: ReturnType<typeof tempDatabase>["db"], categoryId: string) {
  const bucketId = crypto.randomUUID();
  db.insert(buckets)
    .values({
      id: bucketId,
      name: "Food money",
      kind: "spending",
      priority: 1,
      essential: false,
      refillTo: 100,
    })
    .run();
  db.insert(bucketCategories).values({ categoryId, bucketId }).run();
}

test("a kind change is allowed only when no line and no bucket use the category", () => {
  const book = tempDatabase();
  try {
    const free = createCategory(book.db, { name: "Pay", kind: "income", ...write });
    const changed = updateCategory(book.db, free.id, {
      name: "Pay",
      kind: "expense",
      groupId: null,
      essential: true,
      ...write,
    });
    expect(changed.kind).toBe("expense");
    expect(changed.essential).toBe(true);

    const used = createCategory(book.db, { name: "Groceries", kind: "expense", ...write });
    addLine(book.db, used.id);
    expectCode(
      () =>
        updateCategory(book.db, used.id, {
          name: "Groceries",
          kind: "income",
          groupId: null,
          essential: false,
          ...write,
        }),
      "category_kind_locked",
    );

    const mapped = createCategory(book.db, { name: "Fuel", kind: "expense", ...write });
    addBucket(book.db, mapped.id);
    expectCode(
      () =>
        updateCategory(book.db, mapped.id, {
          name: "Fuel",
          kind: "income",
          groupId: null,
          essential: false,
          ...write,
        }),
      "category_kind_locked",
    );
  } finally {
    book.close();
  }
});

test("delete of a group moves its categories to no group", () => {
  const book = tempDatabase();
  try {
    const group = createCategoryGroup(book.db, { name: "Home", ...write });
    const rent = createCategory(book.db, { name: "Rent", kind: "expense", groupId: group.id, ...write });
    const tax = createCategory(book.db, { name: "Property tax", kind: "expense", groupId: group.id, ...write });
    deleteCategoryGroup(book.db, group.id, write);
    expect(listCategoryGroups(book.db).items).toEqual([]);
    const page = listCategories(book.db, { page: 1, pageSize: 50, archived: false });
    const byId = new Map(page.items.map((item) => [item.id, item.groupId]));
    expect(byId.get(rent.id)).toBeNull();
    expect(byId.get(tax.id)).toBeNull();
  } finally {
    book.close();
  }
});

test("groups and categories sort by name without case", () => {
  const book = tempDatabase();
  try {
    createCategoryGroup(book.db, { name: "zeta", ...write });
    createCategoryGroup(book.db, { name: "Alpha", ...write });
    expect(listCategoryGroups(book.db).items.map((group) => group.name)).toEqual(["Alpha", "zeta"]);

    createCategory(book.db, { name: "rent", kind: "expense", ...write });
    createCategory(book.db, { name: "Groceries", kind: "expense", ...write });
    const page = listCategories(book.db, { page: 1, pageSize: 50, archived: false });
    expect(page.items.map((category) => category.name)).toEqual(["Groceries", "rent"]);
  } finally {
    book.close();
  }
});

test("a duplicate group name is rejected", () => {
  const book = tempDatabase();
  try {
    const home = createCategoryGroup(book.db, { name: "Home", ...write });
    expectCode(() => createCategoryGroup(book.db, { name: "home", ...write }), "group_name_taken");
    const bills = createCategoryGroup(book.db, { name: "Bills", ...write });
    expectCode(
      () => updateCategoryGroup(book.db, bills.id, { name: "HOME", ...write }),
      "group_name_taken",
    );
    expect(updateCategoryGroup(book.db, home.id, { name: "HOME", ...write }).name).toBe("HOME");
  } finally {
    book.close();
  }
});

test("archive then restore returns a category and a tag to the active list", () => {
  const book = tempDatabase();
  try {
    const category = createCategory(book.db, { name: "Groceries", kind: "expense", ...write });
    expect(archiveCategory(book.db, category.id, write).archivedAt).toBe(at);
    expect(restoreCategory(book.db, category.id, write).archivedAt).toBeNull();
    expectCode(() => restoreCategory(book.db, category.id, write), "category_not_archived");

    const tag = createTag(book.db, { name: "Trip", ...write });
    expect(archiveTag(book.db, tag.id, write).archivedAt).toBe(at);
    expect(restoreTag(book.db, tag.id, write).archivedAt).toBeNull();
    expectCode(() => restoreTag(book.db, tag.id, write), "tag_not_archived");
  } finally {
    book.close();
  }
});
