import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateDatabase } from "./index";
import { databaseBefore } from "./migrate-before";

const before = "0013_monthly_funding";

function addRun(sqlite: Database, id: string, date: string, undoneAt: string | null) {
  sqlite
    .query("insert into transactions (id, account_id, date, amount, payee_raw, payee_normalized, status, source) values (?, 'cash', ?, 500, 'Pay', 'pay', 'open', 'manual')")
    .run(`income-${id}`, date);
  sqlite
    .query("insert into funding_runs (id, income_transaction_id, date, created_at, undone_at) values (?, ?, ?, '2026-01-01T00:00:00Z', ?)")
    .run(id, `income-${id}`, date, undoneAt);
}

function addEvent(sqlite: Database, id: string, run: string | null, amount: number, undoneAt: string | null = null) {
  sqlite
    .query("insert into bucket_events (id, kind, bucket_id, amount, date, funding_run_id, undone_at) values (?, 'fund', 'food', ?, '2026-09-15', ?, ?)")
    .run(id, amount, run, undoneAt);
}

test("the migration moves the funding runs to months: month on events, undone events, a hold for each month with no active run (decision 0059)", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-db-monthly-"));
  const sqlite = databaseBefore(dir, before);
  try {
    sqlite.query("insert into settings (key, value) values ('currency', 'CAD'), ('emergencyFundMonths', '3')").run();
    sqlite.query("insert into accounts (id, name, kind, on_budget, opening_balance, created_at, sort_key) values ('cash', 'Cash', 'chequing', 1, 0, '2026-01-01T00:00:00Z', 'cash')").run();
    sqlite
      .query("insert into buckets (id, name, kind, priority, essential, color, icon, start_date, sort_key) values ('food', 'Food', 'spending', 0, 0, 'mint', 'wallet', '2026-01-01', 'food')")
      .run();
    sqlite.query("insert into inbox_decisions (item_key, decision, decided_at) values ('paycheck_funding:a', 'keep_unassigned', '2026-01-01T00:00:00Z')").run();
    addRun(sqlite, "active", "2026-09-01", null);
    addRun(sqlite, "undone", "2026-10-01", "2026-10-05T00:00:00Z");
    addRun(sqlite, "mixed-active", "2026-11-01", null);
    addRun(sqlite, "mixed-undone", "2026-11-15", "2026-11-20T00:00:00Z");
    addEvent(sqlite, "e-active", "active", 1_000);
    addEvent(sqlite, "e-undone", "undone", 700);
    addEvent(sqlite, "e-mixed-active", "mixed-active", 300);
    addEvent(sqlite, "e-mixed-undone", "mixed-undone", 200);
    addEvent(sqlite, "e-manual", null, 50);
    addEvent(sqlite, "e-manual-undone", null, 60, "2026-09-20T00:00:00Z");

    migrateDatabase(sqlite);

    expect(sqlite.query("select id, month, undone_at from bucket_events order by id").all()).toEqual([
      { id: "e-active", month: "2026-09", undone_at: null },
      { id: "e-manual", month: null, undone_at: null },
      { id: "e-manual-undone", month: null, undone_at: "2026-09-20T00:00:00Z" },
      { id: "e-mixed-active", month: "2026-11", undone_at: null },
      { id: "e-mixed-undone", month: "2026-11", undone_at: "2026-11-20T00:00:00Z" },
      { id: "e-undone", month: "2026-10", undone_at: "2026-10-05T00:00:00Z" },
    ]);
    expect(sqlite.query("select month, created_at from month_holds").all()).toEqual([{ month: "2026-10", created_at: "2026-10-05T00:00:00Z" }]);
    expect(sqlite.query("select name from sqlite_master where name = 'funding_runs'").all()).toEqual([]);
    expect(sqlite.query("select name from pragma_table_info('bucket_events') where name = 'funding_run_id'").all()).toEqual([]);
    expect(sqlite.query("select key from settings").all()).toEqual([{ key: "currency" }]);
    expect(sqlite.query("select item_key from inbox_decisions").all()).toEqual([]);
    expect(sqlite.query("select id, months, fill_months from buckets").all()).toEqual([{ id: "food", months: null, fill_months: null }]);
    expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
