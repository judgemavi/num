import { expect, test } from "bun:test";
import { createCategory, createCategoryGroup, updateCategory, updateCategoryGroup } from "./categories";
import { createMerchant, updateMerchant } from "./merchants";
import { createTag, updateTag } from "./tags";
import { expectCode, tempDatabase } from "./test-support";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };
const entities = [
  { code: "category_name_taken", create: createCategory, update: updateCategory },
  { code: "group_name_taken", create: createCategoryGroup, update: updateCategoryGroup },
  { code: "merchant_name_taken", create: createMerchant, update: updateMerchant },
  { code: "tag_name_taken", create: createTag, update: updateTag },
] as const;

for (const entity of entities) {
  test(`${entity.code}: an accented name can follow its plain name`, () => {
    const book = tempDatabase();
    try {
      entity.create(book.db, { name: "Ecole", kind: "expense", color: "sky", ...saved });
      expect(entity.create(book.db, { name: "École", kind: "expense", color: "sky", ...saved }).name).toBe("École");
      expectCode(() => entity.create(book.db, { name: "éCOLE", kind: "expense", color: "sky", ...saved }), entity.code);
    } finally {
      book.close();
    }
  });

  test(`${entity.code}: names ignore Unicode case and use NFC on create and rename`, () => {
    const book = tempDatabase();
    try {
      entity.create(book.db, { name: "École", kind: "expense", color: "sky", ...saved });
      for (const name of ["ÉCOLE", "école", "E\u0301cole"]) {
        expectCode(() => entity.create(book.db, { name, kind: "expense", color: "sky", ...saved }), entity.code);
      }
      const other = entity.create(book.db, { name: "Other", kind: "expense", color: "sky", ...saved });
      expectCode(() => entity.update(book.db, other.id, { name: "éCOLE", ...saved }), entity.code);
      const renamed = entity.update(book.db, other.id, { name: "Éclair", ...saved });
      expect(renamed.name).toBe("Éclair");
      expectCode(() => entity.create(book.db, { name: "éCLAIR", kind: "expense", color: "sky", ...saved }), entity.code);
      expect(entity.create(book.db, { name: "Ecole", kind: "expense", color: "sky", ...saved }).name).toBe("Ecole");
      expect(book.sqlite.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(book.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      book.close();
    }
  });
}
