import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { loadMatchBook, scorePayee } from "./match-book";

test("scoring 150 new rows on 50,000 transactions stays under 500 ms", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-match-time-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  sqlite.exec("pragma journal_mode = off");
  sqlite.exec("begin");
  sqlite.exec(`
    insert into accounts (id, name, kind, on_budget, opening_date, opening_balance)
    values ('acct', 'Everyday', 'chequing', 1, '2020-01-01', 0);
    insert into categories (id, name, kind, essential) values ('food', 'Groceries', 'expense', 0);
    insert into settings (key, value) values ('currency', 'USD'), ('autoConfidence', 'balanced');
  `);
  const insert = sqlite.prepare(`
    insert into transactions (
      id, account_id, date, amount, payee_raw, payee_normalized, status, source, mirror
    ) values (?, 'acct', '2024-06-01', -1000, ?, ?, 'open', 'import', 0)
  `);
  const line = sqlite.prepare(`
    insert into transaction_lines (id, transaction_id, amount, category_id) values (?, ?, -1000, 'food')
  `);
  for (let index = 0; index < 50_000; index += 1) {
    const id = `t${index}`;
    const payee = `SHOP ${index % 4_000}`;
    insert.run(id, payee, payee);
    line.run(`l${index}`, id);
  }
  sqlite.exec("commit");
  const db = createDb(sqlite);
  try {
    const started = performance.now();
    const book = loadMatchBook(db);
    for (let index = 0; index < 150; index += 1) {
      scorePayee(book, { payee: `SHOP ${index}`, amount: -1000, recurring: null });
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(500);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
