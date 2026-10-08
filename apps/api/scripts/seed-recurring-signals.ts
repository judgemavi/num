import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { Temporal } from "@num/shared";
import { createDb } from "../src/db";
import { recurringSignals } from "../src/services/recurring-view";

const count = 50_000;
const planCount = 20;
const asOf = "2026-10-07";
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: bun apps/api/scripts/seed-recurring-signals.ts <sqlite-path>");
  process.exit(1);
}

const path = resolve(arg);
const dataDir = resolve(import.meta.dir, "..", "..", "..", ".data");
if (path === dataDir || path.startsWith(`${dataDir}/`)) {
  console.error("Choose a database path outside .data.");
  process.exit(1);
}
if (existsSync(path)) {
  console.error("That file already exists. Choose a new path.");
  process.exit(1);
}

mkdirSync(dirname(path), { recursive: true });
const sqlite = openDatabase(path);
migrateDatabase(sqlite);

const accountIds = [crypto.randomUUID(), crypto.randomUUID()];
const merchants = Array.from({ length: 40 }, () => crypto.randomUUID());
const origin = Temporal.PlainDate.from(asOf).subtract({ months: 18 }).add({ days: 1 });

sqlite.exec("begin");
const insertAccount = sqlite.prepare(
  `insert into accounts (
    id, name, institution, kind, on_budget, opening_date, opening_balance,
    archived_at, credit_limit, statement_day, due_day, payment_policy, fixed_payment, interest_rate_milli_pct
  ) values (?, ?, null, 'chequing', 1, '2016-01-01', 0, null, null, null, null, null, null, null)`,
);
accountIds.forEach((id, index) => insertAccount.run(id, `Account ${index}`));
const insertMerchant = sqlite.prepare(
  `insert into merchants (id, name, default_category_id, archived_at) values (?, ?, null, null)`,
);
merchants.forEach((id, index) => insertMerchant.run(id, `Merchant ${index}`));
const insertPlan = sqlite.prepare(
  `insert into recurring_plans (
    id, name, kind, account_id, expected_amount, tolerance, amount_mode, category_id, transfer_account_id,
    merchant_id, start_date, freq, interval, month_day, business_day_shift, end_date, active, funds_buckets, archived_at
  ) values (?, ?, 'bill', ?, -2500, 100, 'fixed', null, null, null, '2018-01-15', 'monthly', 1, 15, 'none', null, 1, 0, null)`,
);
for (let index = 0; index < planCount; index += 1) {
  insertPlan.run(crypto.randomUUID(), `Plan ${index}`, accountIds[index % accountIds.length]);
}
const insertTransaction = sqlite.prepare(
  `insert into transactions (
    id, account_id, date, amount, merchant_id, notes, payee_raw, status, source, import_row_id, transfer_peer_id, deleted_at
  ) values (?, ?, ?, ?, ?, null, ?, 'open', 'manual', null, null, null)`,
);
for (let index = 0; index < count; index += 1) {
  const date = origin.add({ days: index % 540 }).toString();
  insertTransaction.run(
    crypto.randomUUID(),
    accountIds[index % accountIds.length],
    date,
    ((index % 80) - 40) * 100,
    merchants[index % merchants.length],
    `Payee ${index % 200}`,
  );
}
sqlite.exec("commit");
sqlite.exec("analyze");

const db = createDb(sqlite);
const start = performance.now();
const signals = recurringSignals(db, asOf);
const ms = performance.now() - start;
console.log(
  `recurringSignals: ${ms.toFixed(1)} ms, missed ${signals.missed.length}, changed ${signals.changed.length}, proposals ${signals.proposals.length}`,
);
sqlite.close();
if (ms >= 200) {
  console.error("recurringSignals took 200 ms or more.");
  process.exit(1);
}
console.log(`Seeded ${count} transactions and ${planCount} plans in ${path}`);
