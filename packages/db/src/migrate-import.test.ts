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

test("migration 0008 drops card fields and clears a credit card interest rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-card-migrate-"));
  const folder = join(dir, "migrations");
  cpSync(source, folder, { recursive: true });
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.tag < "0008");
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));

  const sqlite = openDatabase(join(dir, "num.sqlite"));
  try {
    applyMigrations(sqlite, folder);
    sqlite.exec(`
      insert into accounts (
        id, name, kind, on_budget, opening_date, opening_balance,
        credit_limit, statement_day, due_day, payment_policy, fixed_payment, interest_rate_milli_pct
      ) values
        ('card', 'Card', 'credit_card', 1, '2026-01-01', -5000, 250000, 12, 7, 'full', null, 19990),
        ('save', 'Savings', 'savings', 1, '2026-01-01', 10000, null, null, null, null, null, 150);
      insert into transactions (id, account_id, date, amount, payee_raw, payee_normalized, status, source)
      values ('txn', 'card', '2026-02-02', -2400, 'NORTH MARKET', 'NORTH MARKET', 'open', 'import');
      insert into checkpoints (id, account_id, date, statement_balance, created_at)
      values ('point', 'card', '2026-02-28', -7400, '2026-03-01T16:00:00.000Z');
    `);

    cpSync(join(source, "0008_card_statement_fields.sql"), join(folder, "0008_card_statement_fields.sql"));
    cpSync(join(source, "meta", "0008_snapshot.json"), join(folder, "meta", "0008_snapshot.json"));
    cpSync(join(source, "meta", "_journal.json"), join(folder, "meta", "_journal.json"));
    applyMigrations(sqlite, folder);

    const columns = sqlite.query("select name from pragma_table_info('accounts')").all() as { name: string }[];
    expect(columns.map((column) => column.name)).not.toContain("statement_day");
    expect(columns.map((column) => column.name)).not.toContain("due_day");
    expect(columns.map((column) => column.name)).not.toContain("credit_limit");
    expect(sqlite.query("select interest_rate_milli_pct from accounts where id = 'card'").get()).toEqual({
      interest_rate_milli_pct: null,
    });
    expect(sqlite.query("select interest_rate_milli_pct, opening_balance from accounts where id = 'save'").get()).toEqual({
      interest_rate_milli_pct: 150,
      opening_balance: 10000,
    });
    expect(sqlite.query("select payment_policy from accounts where id = 'card'").get()).toEqual({
      payment_policy: "full",
    });
    expect(sqlite.query("select amount from transactions where id = 'txn'").get()).toEqual({ amount: -2400 });
    expect(sqlite.query("select statement_balance from checkpoints where id = 'point'").get()).toEqual({
      statement_balance: -7400,
    });
    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration 0009 adds automatic label columns on a populated database", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-auto-migrate-"));
  const folder = join(dir, "migrations");
  cpSync(source, folder, { recursive: true });
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.tag < "0009");
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));

  const sqlite = openDatabase(join(dir, "num.sqlite"));
  try {
    applyMigrations(sqlite, folder);
    sqlite.exec(`
      insert into accounts (id, name, kind, on_budget, opening_date, opening_balance)
      values ('acct', 'Everyday', 'chequing', 1, '2026-01-01', 2500);
      insert into settings (key, value) values ('promoteAfter', '3'), ('currency', 'USD');
      insert into transactions (
        id, account_id, date, amount, payee_raw, payee_normalized, status, source, mirror
      ) values (
        'txn', 'acct', '2026-03-12', -1800, 'NORTH CAFE', 'NORTH CAFE', 'open', 'import', 0
      );
      insert into transaction_lines (id, transaction_id, amount) values ('line', 'txn', -1800);
    `);

    cpSync(join(source, "0009_auto_label.sql"), join(folder, "0009_auto_label.sql"));
    cpSync(join(source, "meta", "0009_snapshot.json"), join(folder, "meta", "0009_snapshot.json"));
    cpSync(join(source, "meta", "_journal.json"), join(folder, "meta", "_journal.json"));
    applyMigrations(sqlite, folder);

    const columns = sqlite.query("select name from pragma_table_info('transactions')").all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain("auto_reason");
    expect(columns.map((column) => column.name)).toContain("auto_source_id");
    expect(sqlite.query("select amount, payee_raw, auto_reason, auto_source_id from transactions where id = 'txn'").get()).toEqual({
      amount: -1800,
      payee_raw: "NORTH CAFE",
      auto_reason: null,
      auto_source_id: null,
    });
    expect(sqlite.query("select amount from transaction_lines where id = 'line'").get()).toEqual({ amount: -1800 });
    expect(sqlite.query("select opening_balance from accounts where id = 'acct'").get()).toEqual({ opening_balance: 2500 });
    expect(sqlite.query("select key from settings where key = 'promoteAfter'").get()).toBeNull();
    expect(sqlite.query("select value from settings where key = 'currency'").get()).toEqual({ value: "USD" });
    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
