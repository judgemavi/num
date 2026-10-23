import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { importRowOutcomes, transactionStatuses, type BankBalance, type UnreadableRow } from "@num/shared";
import { accounts } from "./accounts";
import { transactions } from "./ledger";

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    filename: text("filename").notNull(),
    hash: text("hash").notNull(),
    parser: text("parser").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    closingBalance: integer("closing_balance"),
    closingDate: text("closing_date"),
    matchedBefore: integer("matched_before", { mode: "boolean" }).notNull().default(false),
    previousBankBalance: text("previous_bank_balance", { mode: "json" }).$type<BankBalance>(),
    unreadableJson: text("unreadable_json", { mode: "json" }).$type<UnreadableRow[]>().notNull().default([]),
    importedOn: text("imported_on").notNull(),
    createdAt: text("created_at").notNull(),
    undoneAt: text("undone_at"),
  },
  (table) => [index("import_batches_hash").on(table.hash)],
);
export type ImportBatchRow = typeof importBatches.$inferSelect;

export const importRows = sqliteTable(
  "import_rows",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    rowIndex: integer("row_index").notNull(),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    payeeRaw: text("payee_raw").notNull(),
    bankId: text("bank_id"),
    identity: text("identity").notNull(),
    outcome: text("outcome", { enum: importRowOutcomes }).notNull(),
    transactionId: text("transaction_id").references((): AnySQLiteColumn => transactions.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    previousStatus: text("previous_status", { enum: transactionStatuses }),
    previousMirror: integer("previous_mirror", { mode: "boolean" }),
  },
  (table) => [
    uniqueIndex("import_rows_batch_row_unique").on(table.batchId, table.rowIndex),
    uniqueIndex("import_rows_account_identity_active")
      .on(table.accountId, table.identity)
      .where(sql`${table.active} = 1 and ${table.outcome} <> 'duplicate'`),
    index("import_rows_batch").on(table.batchId),
    index("import_rows_transaction").on(table.transactionId),
  ],
);

export const valuations = sqliteTable(
  "valuations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    balance: integer("balance").notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("valuations_account_date").on(table.accountId, table.date)],
);

export const bankBalances = sqliteTable(
  "bank_balances",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    balance: integer("balance").notNull(),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("bank_balances_account_date").on(table.accountId, table.date)],
);
