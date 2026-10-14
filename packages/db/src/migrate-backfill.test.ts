import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { foldName } from "@num/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { migrateDatabase } from "./index";
import { fillSortKeys } from "./sort-keys";

const migrations = join(import.meta.dir, "..", "migrations");
const backfill = "0008_sort_keys_and_account_created_at";

/** A database that has all migrations before the backfill migration. */
function databaseBeforeBackfill(dir: string) {
  const old = join(dir, "old");
  mkdirSync(join(old, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(join(migrations, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((entry) => entry.tag === backfill);
  expect(index).toBeGreaterThan(0);
  const kept = journal.entries.slice(0, index);
  writeFileSync(join(old, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  for (const entry of kept) {
    cpSync(join(migrations, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
  }
  const sqlite = new Database(join(dir, "num.sqlite"));
  migrate(drizzle(sqlite), { migrationsFolder: old });
  return sqlite;
}

function addAccount(sqlite: Database, id: string, openingDate: string | null) {
  sqlite
    .query("insert into accounts (id, name, kind, on_budget, opening_date, opening_balance) values (?, 'A', 'chequing', 1, ?, 0)")
    .run(id, openingDate);
}

test("the backfill migration fills the creation time of each account and the sort keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-db-backfill-"));
  const sqlite = databaseBeforeBackfill(dir);
  try {
    addAccount(sqlite, "audited", "2026-01-01");
    addAccount(sqlite, "from-transaction", null);
    addAccount(sqlite, "from-opening", "2026-02-03");
    addAccount(sqlite, "bare", null);
    sqlite
      .query("insert into audit_log (id, entity, entity_id, action, source, at) values ('a1', 'accounts', 'audited', 'create', 'ui', '2026-03-04T05:06:07Z')")
      .run();
    sqlite
      .query("insert into audit_log (id, entity, entity_id, action, source, at) values ('a2', 'accounts', 'audited', 'update', 'ui', '2026-09-09T00:00:00Z')")
      .run();
    sqlite
      .query(
        "insert into transactions (id, account_id, date, amount, payee_raw, payee_normalized, status, source) values ('t1', 'from-transaction', '2026-05-06', -100, 'Shop', 'shop', 'open', 'manual')",
      )
      .run();
    for (const [id, name] of [["m1", "École"], ["m2", "Eagle"], ["m3", "Fable"]]) {
      sqlite.query("insert into merchants (id, name) values (?, ?)").run(id, name);
    }

    sqlite.query("insert into category_groups (id, name) values ('g1', 'Épargne')").run();
    sqlite.query("insert into categories (id, name, kind, essential) values ('c1', 'Café', 'expense', 0)").run();
    sqlite.query("insert into tags (id, name) values ('t2', 'Été')").run();

    migrateDatabase(sqlite);

    expect(sqlite.query("select sort_key from category_groups").get()).toEqual({ sort_key: "epargne" });
    expect(sqlite.query("select sort_key from categories").get()).toEqual({ sort_key: "cafe" });
    expect(sqlite.query("select sort_key from tags").get()).toEqual({ sort_key: "ete" });
    expect(sqlite.query("select sort_key from accounts where id = 'audited'").get()).toEqual({ sort_key: "a" });
    const created = Object.fromEntries(
      (sqlite.query("select id, created_at from accounts").all() as { id: string; created_at: string }[]).map((row) => [row.id, row.created_at]),
    );
    expect(created).toEqual({
      audited: "2026-03-04T05:06:07Z",
      "from-transaction": "2026-05-06T00:00:00Z",
      "from-opening": "2026-02-03T00:00:00Z",
      bare: "1970-01-01T00:00:00Z",
    });
    const order = sqlite.query("select name from merchants order by sort_key, name, id").all();
    expect(order).toEqual([{ name: "Eagle" }, { name: "École" }, { name: "Fable" }]);
    expect(sqlite.query("select sort_key from merchants where id = 'm1'").get()).toEqual({ sort_key: foldName("École") });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the fill step leaves a written key as it is", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-db-backfill-"));
  const sqlite = new Database(join(dir, "num.sqlite"));
  try {
    migrateDatabase(sqlite);
    sqlite.query("insert into merchants (id, name, sort_key) values ('m1', 'École', 'ecole')").run();
    fillSortKeys(sqlite);
    expect(sqlite.query("select sort_key from merchants").get()).toEqual({ sort_key: "ecole" });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
