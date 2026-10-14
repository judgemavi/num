import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateDatabase } from "./index";
import { databaseBefore } from "./migrate-before";

const clearOpen = "0011_clear_open_in_accounts_without_imports";

function addAccount(sqlite: Database, id: string, importPreset: string | null, columnMap: string | null) {
  sqlite
    .query(
      "insert into accounts (id, name, kind, on_budget, opening_balance, import_preset, column_map, created_at, sort_key) values (?, ?, 'chequing', 1, 0, ?, ?, '2026-01-01T00:00:00Z', ?)",
    )
    .run(id, id, importPreset, columnMap, id);
}

function addTransaction(sqlite: Database, id: string, accountId: string, status: "open" | "cleared") {
  sqlite
    .query(
      "insert into transactions (id, account_id, date, amount, payee_raw, payee_normalized, status, source) values (?, ?, '2026-05-06', -100, 'Shop', 'shop', ?, 'manual')",
    )
    .run(id, accountId, status);
}

test("the migration clears only the open transactions of accounts that do not get imports (decision 0052)", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-db-pending-"));
  const sqlite = databaseBefore(dir, clearOpen);
  try {
    addAccount(sqlite, "no-import", null, null);
    addAccount(sqlite, "preset", "preset-a", null);
    addAccount(sqlite, "mapped", null, '{"date":0}');
    addTransaction(sqlite, "plain-open", "no-import", "open");
    addTransaction(sqlite, "plain-cleared", "no-import", "cleared");
    addTransaction(sqlite, "preset-open", "preset", "open");
    addTransaction(sqlite, "mapped-open", "mapped", "open");

    migrateDatabase(sqlite);

    const status = Object.fromEntries(
      (sqlite.query("select id, status from transactions").all() as { id: string; status: string }[]).map((row) => [row.id, row.status]),
    );
    expect(status).toEqual({
      "plain-open": "cleared",
      "plain-cleared": "cleared",
      "preset-open": "open",
      "mapped-open": "open",
    });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
