import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { identityColors } from "@num/shared";
import { migrateDatabase, openDatabase } from "./index";

test("existing groups get colours in list order without changing category links", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-group-colours-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  try {
    const folder = join(dir, "baseline");
    mkdirSync(join(folder, "meta"), { recursive: true });
    const migrations = join(import.meta.dir, "../migrations");
    const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8"));
    // Apply the old schema with the real migration tool before testing the new migration set.
    writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    copyFileSync(join(migrations, "0000_baseline.sql"), join(folder, "0000_baseline.sql"));
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    for (let index = 13; index >= 0; index--) {
      const name = `Group ${String(index).padStart(2, "0")}`;
      sqlite.query("INSERT INTO category_groups (id, name, sort_key) VALUES (?, ?, ?)").run(`g${index}`, name, name.toLowerCase());
      sqlite.query("INSERT INTO categories (id, name, sort_key, kind, group_id) VALUES (?, ?, ?, 'expense', ?)").run(`c${index}`, name, name.toLowerCase(), `g${index}`);
    }
    const links = sqlite.query("SELECT id, group_id FROM categories ORDER BY id").all();
    migrateDatabase(sqlite);
    const groups = sqlite.query<{ id: string; color: string }, []>("SELECT id, color FROM category_groups ORDER BY sort_key, name, id").all();
    expect(groups.map((group) => group.color)).toEqual([...identityColors, "sky", "ocean"]);
    expect(sqlite.query("SELECT id, group_id FROM categories ORDER BY id").all()).toEqual(links);
    const column = sqlite.query<{ name: string; notnull: number; dflt_value: string | null }, []>("PRAGMA table_info(category_groups)").all().find((row) => row.name === "color");
    expect(column?.notnull).toBe(1);
    expect(column?.dflt_value).toBeNull();
    expect(sqlite.query("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    migrateDatabase(sqlite);
    expect(sqlite.query("SELECT id, color FROM category_groups ORDER BY sort_key, name, id").all()).toEqual(groups);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
