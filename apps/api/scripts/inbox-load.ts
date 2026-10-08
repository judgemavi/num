import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { normalizePayee, Temporal } from "@num/shared";
import { createDb } from "../src/db";
import { listInbox } from "../src/services/inbox";

const count = 50_000;
const dir = mkdtempSync(join(tmpdir(), "num-inbox-load-"));
const path = join(dir, "num.sqlite");
const sqlite = openDatabase(path);
migrateDatabase(sqlite);

const accountA = crypto.randomUUID();
const accountB = crypto.randomUUID();
const categories = Array.from({ length: 8 }, () => crypto.randomUUID());
const merchants = Array.from({ length: 30 }, () => crypto.randomUUID());
const origin = Temporal.PlainDate.from("2016-01-01");

sqlite.exec("begin");
const insertAccount = sqlite.prepare(
  `insert into accounts (
    id, name, institution, kind, on_budget, opening_date, opening_balance,
    archived_at, credit_limit, statement_day, due_day, payment_policy, fixed_payment, interest_rate_milli_pct
  ) values (?, ?, null, 'chequing', 1, '2016-01-01', 0, null, null, null, null, null, null, null)`,
);
insertAccount.run(accountA, "Account A");
insertAccount.run(accountB, "Account B");
const insertCategory = sqlite.prepare(
  `insert into categories (id, name, kind, group_id, essential, archived_at) values (?, ?, 'expense', null, 0, null)`,
);
categories.forEach((id, index) => insertCategory.run(id, `Category ${index}`));
const insertMerchant = sqlite.prepare(
  `insert into merchants (id, name, default_category_id, archived_at) values (?, ?, null, null)`,
);
merchants.forEach((id, index) => insertMerchant.run(id, `Merchant ${index}`));
const insertTransaction = sqlite.prepare(
  `insert into transactions (
    id, account_id, date, amount, merchant_id, notes, payee_raw, payee_normalized, status, source, import_row_id, transfer_peer_id, deleted_at
  ) values (?, ?, ?, ?, ?, null, ?, ?, 'open', 'manual', null, null, null)`,
);
const insertLine = sqlite.prepare(
  `insert into transaction_lines (id, transaction_id, amount, memo, category_id, transfer_account_id) values (?, ?, ?, null, ?, null)`,
);

for (let index = 0; index < count; index += 1) {
  const id = crypto.randomUUID();
  const accountId = index % 10 === 0 ? accountB : accountA;
  const date = origin.add({ days: index % 3650 }).toString();
  const amount = ((index % 400) - 120) * 25;
  const payee = `Payee ${index % 500}`;
  const merchantId = index % 7 === 0 ? null : (merchants[index % merchants.length] ?? null);
  insertTransaction.run(id, accountId, date, amount, merchantId, payee, normalizePayee(payee));
  insertLine.run(crypto.randomUUID(), id, amount, index % 17 === 0 ? null : (categories[index % categories.length] ?? null));
}
sqlite.exec("commit");
sqlite.exec("analyze");

const db = createDb(sqlite);
const start = performance.now();
const inbox = listInbox(db, "2026-01-15");
const ms = performance.now() - start;
console.log(`inbox: ${ms.toFixed(1)} ms, items ${inbox.count}`);
sqlite.close();
rmSync(dir, { recursive: true, force: true });
if (ms >= 300) {
  console.error("The inbox took 300 ms or more.");
  process.exit(1);
}
