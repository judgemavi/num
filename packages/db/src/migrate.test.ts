import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { migrateDatabase, openDatabase } from "./index";

function schemaSnapshot(sqlite: ReturnType<typeof openDatabase>): string {
  const objects = sqlite
    .query(
      "select type, name, tbl_name, sql from sqlite_master where sql is not null order by type, name",
    )
    .all();
  const migrations = sqlite.query("select id, hash from __drizzle_migrations order by id").all();
  return JSON.stringify({ objects, migrations });
}

test("a fresh database migrates and the second run does not change it", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-db-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  try {
    migrateDatabase(sqlite);

    expect(sqlite.query("pragma integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);

    const before = schemaSnapshot(sqlite);
    migrateDatabase(sqlite);

    expect(schemaSnapshot(sqlite)).toBe(before);
    expect(sqlite.query("pragma integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);

    sqlite.exec("pragma foreign_keys = off");
    sqlite
      .query("insert into bucket_categories (category_id, bucket_id) values ('missing-category', 'missing-bucket')")
      .run();
    expect(() => migrateDatabase(sqlite)).toThrow("Foreign key check failed");
    expect(sqlite.query("pragma foreign_keys").get()).toEqual({ foreign_keys: 1 });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
