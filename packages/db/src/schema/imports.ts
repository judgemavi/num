import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { importOutcomes } from "./codes";
import { transactions } from "./ledger";
import { proposals } from "./records";
import { isoDate, nullOrIsoDate, oneOf } from "./sql";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  hash: text("hash").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    documentId: text("document_id").references(() => documents.id),
    proposalId: text("proposal_id").references(() => proposals.id),
    parser: text("parser").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    closingBalance: integer("closing_balance"),
    closingDate: text("closing_date"),
    createdAt: text("created_at").notNull(),
    undoneAt: text("undone_at"),
  },
  (table) => [
    check("import_batches_period_start", isoDate(table.periodStart)),
    check("import_batches_period_end", isoDate(table.periodEnd)),
    check("import_batches_closing_date", nullOrIsoDate(table.closingDate)),
    check(
      "import_batches_source",
      sql`(
        ${table.documentId} is not null and ${table.proposalId} is null
      ) or (
        ${table.documentId} is null and ${table.proposalId} is not null
      )`,
    ),
  ],
);

export const importRows = sqliteTable(
  "import_rows",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id),
    // Stored on the row so the active identity index can use account_id.
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
    // True while the parent batch is not undone.
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    check("import_rows_row_index", sql`${table.rowIndex} >= 0`),
    check("import_rows_date", isoDate(table.date)),
    check("import_rows_outcome", oneOf(table.outcome, importOutcomes)),
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
    deletedAt: text("deleted_at"),
  },
  (table) => [
    check("valuations_date", isoDate(table.date)),
    uniqueIndex("valuations_account_date_active")
      .on(table.accountId, table.date)
      .where(sql`${table.deletedAt} is null`),
  ],
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
  (table) => [
    check("checkpoints_date", isoDate(table.date)),
    index("checkpoints_account_date").on(table.accountId, table.date),
  ],
);
