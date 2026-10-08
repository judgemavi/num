import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { createCategory, updateCategory } from "./categories";
import { createTag, updateTag } from "./tags";
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
      () => updateCategory(book.db, pay.id, { name: "Pay", groupId: null, essential: true, source: "ui", at }),
      "essential_expense_only",
    );
  } finally {
    book.close();
  }
});
