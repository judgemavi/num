import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { Temporal, type TransactionListQuery } from "@num/shared";
import { createDb } from "../src/db";
import { listTransactions } from "../src/services/transaction-list";

const count = 50_000;
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: bun apps/api/scripts/seed-transaction-list.ts <sqlite-path>");
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

const accountA = crypto.randomUUID();
const accountB = crypto.randomUUID();
const categories = Array.from({ length: 8 }, () => crypto.randomUUID());
const tags = Array.from({ length: 8 }, () => crypto.randomUUID());
const merchants = Array.from({ length: 30 }, () => crypto.randomUUID());
const markerMerchant = crypto.randomUUID();
const origin = Temporal.PlainDate.from("2016-01-01");

sqlite.exec("begin");
const insertAccount = sqlite.prepare(
  `insert into accounts (
    id, name, institution, kind, on_budget, opening_date, opening_balance,
    archived_at, credit_limit, statement_day, due_day, payment_policy, fixed_payment, interest_rate_milli_pct
  ) values (?, ?, null, 'chequing', 1, '2016-01-01', ?, null, null, null, null, null, null, null)`,
);
insertAccount.run(accountA, "Account A", 250_000);
insertAccount.run(accountB, "Account B", 0);
const insertCategory = sqlite.prepare(
  `insert into categories (id, name, kind, group_id, essential, archived_at) values (?, ?, 'expense', null, 0, null)`,
);
categories.forEach((id, index) => insertCategory.run(id, `Category ${index}`));
const insertTag = sqlite.prepare(`insert into tags (id, name, archived_at) values (?, ?, null)`);
tags.forEach((id, index) => insertTag.run(id, `Tag ${index}`));
const insertMerchant = sqlite.prepare(
  `insert into merchants (id, name, default_category_id, archived_at) values (?, ?, null, null)`,
);
merchants.forEach((id, index) => insertMerchant.run(id, `Merchant ${index}`));
insertMerchant.run(markerMerchant, "Marker merchant");

const insertTransaction = sqlite.prepare(
  `insert into transactions (
    id, account_id, date, amount, merchant_id, notes, payee_raw, status, source, import_row_id, transfer_peer_id, deleted_at
  ) values (?, ?, ?, ?, ?, ?, ?, 'open', 'manual', null, null, null)`,
);
const insertLine = sqlite.prepare(
  `insert into transaction_lines (id, transaction_id, amount, memo, category_id, transfer_account_id) values (?, ?, ?, null, ?, null)`,
);
const insertTagLink = sqlite.prepare(`insert into line_tags (line_id, tag_id) values (?, ?)`);

let categoryId = categories[0] ?? "";
let tagId = tags[0] ?? "";
for (let index = 0; index < count; index += 1) {
  const id = crypto.randomUUID();
  const lineId = crypto.randomUUID();
  const accountId = index % 10 === 0 ? accountB : accountA;
  const date = origin.add({ days: index % 3650 }).toString();
  const amount = ((index % 400) - 120) * 25;
  const uncategorized = index % 17 === 0;
  const merchantId = index === 12 ? markerMerchant : index % 7 === 0 ? null : (merchants[index % merchants.length] ?? null);
  const payee = index === 10 ? "Marker payee" : `Payee ${index % 500}`;
  const notes = index === 11 ? "marker note" : null;
  insertTransaction.run(id, accountId, date, amount, merchantId, notes, payee);
  insertLine.run(lineId, id, amount, uncategorized ? null : (categories[index % categories.length] ?? null));
  if (index % 11 === 0) {
    insertTagLink.run(lineId, tags[index % tags.length] ?? null);
  }
  if (index === 0) {
    categoryId = categories[0] ?? categoryId;
    tagId = tags[0] ?? tagId;
  }
}
sqlite.exec("commit");
sqlite.exec("analyze");

const db = createDb(sqlite);
const base: TransactionListQuery = { page: 1, pageSize: 50, uncategorized: false };
let failed = false;

let accountTotal = 0;

function time(label: string, query: TransactionListQuery) {
  const start = performance.now();
  const page = listTransactions(db, query);
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(1)} ms, total ${page.total}`);
  if (query.accountId === accountA && query.page === 1 && !query.from && !query.uncategorized && !query.q) {
    accountTotal = page.total;
  }
  if (ms >= 200) {
    failed = true;
  }
}

time("default page", base);
time("account and running balance", { ...base, accountId: accountA });
time("account and date", { ...base, accountId: accountA, from: "2020-01-01", to: "2020-01-31" });
time("category", { ...base, categoryId });
time("tag", { ...base, tagId });
time("merchant", { ...base, merchantId: merchants[1] });
time("uncategorized", { ...base, uncategorized: true });
time("search", { ...base, q: "marker" });
time("last account page", {
  ...base,
  accountId: accountA,
  page: Math.max(1, Math.ceil(accountTotal / 50)),
});

sqlite.close();
if (failed) {
  console.error("A filtered page took 200 ms or more.");
  process.exit(1);
}
console.log(`Seeded ${count} transactions in ${path}`);
