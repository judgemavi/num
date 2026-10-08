import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { expect, test } from "bun:test";
import { openDatabase } from "./open";

const source = join(import.meta.dir, "..", "migrations");

function applyMigrations(sqlite: Database, folder: string) {
  sqlite.exec("pragma foreign_keys = off");
  try {
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    const violations = sqlite.query("pragma foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`Foreign key check failed: ${JSON.stringify(violations)}`);
    }
  } finally {
    sqlite.exec("pragma foreign_keys = on");
  }
}

test("migration 0006 keeps a transaction linked to an import row", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-import-migrate-"));
  const folder = join(dir, "migrations");
  cpSync(source, folder, { recursive: true });
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.tag < "0006");
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));

  const sqlite = openDatabase(join(dir, "num.sqlite"));
  try {
    applyMigrations(sqlite, folder);
    sqlite.exec(`
      insert into accounts (id, name, kind, on_budget, opening_date, opening_balance)
      values ('acct', 'Everyday', 'chequing', 1, '2026-01-01', 0);
      insert into documents (id, filename, hash, mime_type, storage_path, uploaded_at)
      values ('doc', 'a.csv', 'hash', 'text/csv', 'uploads/hash', '2026-10-07T16:00:00Z');
      insert into import_batches (id, account_id, document_id, parser, period_start, period_end, created_at)
      values ('batch', 'acct', 'doc', 'csv', '2026-01-02', '2026-01-02', '2026-10-07T16:00:00Z');
      insert into import_rows (id, batch_id, account_id, row_index, date, amount, payee_raw, identity, outcome, active)
      values ('row', 'batch', 'acct', 0, '2026-01-02', -100, 'SHOP', 'bank:FIT', 'created', 1);
      insert into transactions (id, account_id, date, amount, payee_raw, payee_normalized, status, source, import_row_id)
      values ('txn', 'acct', '2026-01-02', -100, 'SHOP', 'SHOP', 'open', 'import', 'row');
      update import_rows set transaction_id = 'txn' where id = 'row';
    `);

    cpSync(join(source, "0006_account_import_fields.sql"), join(folder, "0006_account_import_fields.sql"));
    cpSync(join(source, "meta", "0006_snapshot.json"), join(folder, "meta", "0006_snapshot.json"));
    cpSync(join(source, "meta", "_journal.json"), join(folder, "meta", "_journal.json"));
    applyMigrations(sqlite, folder);

    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);
    expect(sqlite.query("select import_row_id from transactions where id = 'txn'").get()).toEqual({
      import_row_id: "row",
    });
    expect(sqlite.query("select transaction_id from import_rows where id = 'row'").get()).toEqual({
      transaction_id: "txn",
    });
    expect(sqlite.query("select unreadable_json from import_batches where id = 'batch'").get()).toEqual({
      unreadable_json: "[]",
    });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
