import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { transactions } from "./ledger";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  hash: text("hash").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
  parser: text("parser").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  closingBalance: integer("closing_balance"),
  closingDate: text("closing_date"),
  unreadableJson: text("unreadable_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  undoneAt: text("undone_at"),
});

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
    outcome: text("outcome").notNull(),
    transactionId: text("transaction_id").references((): AnySQLiteColumn => transactions.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    previousStatus: text("previous_status"),
  },
  (table) => [
    uniqueIndex("import_rows_batch_row_unique").on(table.batchId, table.rowIndex),
    uniqueIndex("import_rows_account_identity_active")
      .on(table.accountId, table.identity)
      .where(sql`${table.active} = 1 and ${table.outcome} <> 'duplicate'`),
    index("import_rows_batch").on(table.batchId),
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
    documentId: text("document_id").references(() => documents.id),
  },
  (table) => [uniqueIndex("valuations_account_date").on(table.accountId, table.date)],
);

export const checkpoints = sqliteTable(
  "checkpoints",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    statementBalance: integer("statement_balance").notNull(),
    createdAt: text("created_at").notNull(),
    unlockedAt: text("unlocked_at"),
  },
  (table) => [index("checkpoints_account_date").on(table.accountId, table.date)],
);
