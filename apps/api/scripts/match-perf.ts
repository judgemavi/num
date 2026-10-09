import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { createDb } from "../src/db";
import { createAccount } from "../src/services/accounts";
import { createCategory } from "../src/services/categories";
import { importStatement } from "../src/services/imports";
import { createTransaction } from "../src/services/transactions";

const count = 50_000;
const dir = mkdtempSync(join(tmpdir(), "num-match-perf-"));
const sqlite = openDatabase(join(dir, "num.sqlite"));
migrateDatabase(sqlite);
sqlite.exec("begin");
sqlite.exec(`
  insert into accounts (id, name, kind, on_budget, opening_date, opening_balance)
  values ('acct', 'Everyday', 'chequing', 1, '2020-01-01', 0);
  insert into categories (id, name, kind, essential) values ('food', 'Groceries', 'expense', 0);
  insert into settings (key, value) values ('currency', 'USD');
`);
const insertTxn = sqlite.prepare(`
  insert into transactions (
    id, account_id, date, amount, payee_raw, payee_normalized, status, source, mirror
  ) values (?, 'acct', '2024-06-01', -1000, ?, ?, 'open', 'import', 0)
`);
const insertLine = sqlite.prepare(`
  insert into transaction_lines (id, transaction_id, amount, category_id)
  values (?, ?, -1000, 'food')
`);
for (let index = 0; index < count; index += 1) {
  const id = `t${index}`;
  const payee = `SHOP ${index % 4000}`;
  insertTxn.run(id, payee, payee);
  insertLine.run(`l${index}`, id);
}
sqlite.exec("commit");

const db = createDb(sqlite);
const at = "2026-10-08T16:00:00.000Z";
const account = createAccount(db, {
  name: "Import",
  institution: null,
  kind: "chequing",
  openingDate: "2026-01-01",
  openingBalance: 0,
  source: "ui",
  at,
});
const lines = ["date,description,amount"];
for (let index = 0; index < 150; index += 1) {
  lines.push(`06/15/2026,NEW SHOP ${index},-12.00`);
}
const startedImport = performance.now();
importStatement(db, dir, {
  source: "import",
  at,
  asOf: "2026-06-20",
  accountId: account.id,
  filename: "new.csv",
  mimeType: "text/csv",
  bytes: new TextEncoder().encode(lines.join("\n")),
  columnMap: columnMapSchema.parse({
    hasHeader: true,
    date: 0,
    description: 1,
    amount: 2,
    dateOrder: "mdy",
    signConvention: "account",
    decimalSeparator: ".",
  }),
});
const importMs = performance.now() - startedImport;

const food = createCategory(db, { name: "Food", kind: "expense", source: "ui", at });
const startedConfirm = performance.now();
createTransaction(db, {
  accountId: "acct",
  date: "2024-06-02",
  amount: -1000,
  payeeRaw: "SHOP 0",
  status: "open",
  lines: [{ amount: -1000, categoryId: food.id }],
  source: "ui",
  at,
});
const confirmMs = performance.now() - startedConfirm;

console.log(`import 150 rows: ${importMs.toFixed(1)} ms`);
console.log(`one confirmation: ${confirmMs.toFixed(1)} ms`);
sqlite.close();
rmSync(dir, { recursive: true, force: true });
if (importMs >= 500) {
  console.error("Import is slower than 500 ms");
  process.exitCode = 1;
}
if (confirmMs >= 200) {
  console.error("Confirmation is slower than 200 ms");
  process.exitCode = 1;
}
