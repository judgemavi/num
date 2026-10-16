import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { autoReasons, transactionSources, transactionStatuses } from "@num/shared";
import { accounts } from "./accounts";
import { categories, merchants, tags } from "./categories";
import { importRows } from "./imports";

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id),
    payeeRaw: text("payee_raw").notNull(),
    payeeNormalized: text("payee_normalized").notNull(),
    status: text("status", { enum: transactionStatuses }).notNull(),
    source: text("source", { enum: transactionSources }).notNull(),
    importRowId: text("import_row_id")
      .unique()
      .references(() => importRows.id),
    transferPeerId: text("transfer_peer_id")
      .unique()
      .references((): AnySQLiteColumn => transactions.id),
    mirror: integer("mirror", { mode: "boolean" }).notNull().default(false),
    autoReason: text("auto_reason", { enum: autoReasons }),
    autoConfidence: integer("auto_confidence"),
    autoSourceId: text("auto_source_id"),
    refundOfId: text("refund_of_id").references((): AnySQLiteColumn => transactions.id),
    editedAt: text("edited_at"),
  },
  (table) => [
    index("transactions_auto_reason").on(table.autoReason).where(sql`${table.autoReason} IS NOT NULL`),
    index("transactions_refund_of").on(table.refundOfId),
    index("transactions_date").on(table.date, table.id),
    index("transactions_account_date").on(table.accountId, table.date, table.id, table.amount),
    index("transactions_merchant_date").on(table.merchantId, table.date, table.id),
    index("transactions_payee_normalized").on(table.payeeNormalized, table.date, table.id),
  ],
);
export type TransactionRow = typeof transactions.$inferSelect;

export const transactionLines = sqliteTable(
  "transaction_lines",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    amount: integer("amount").notNull(),
    memo: text("memo"),
    categoryId: text("category_id").references(() => categories.id),
    transferAccountId: text("transfer_account_id").references(() => accounts.id),
  },
  (table) => [
    index("transaction_lines_transfer_account").on(table.transferAccountId).where(sql`${table.transferAccountId} IS NOT NULL`),
    index("transaction_lines_transaction").on(table.transactionId),
    index("transaction_lines_category").on(table.categoryId),
    index("transaction_lines_uncategorized")
      .on(table.transactionId)
      .where(sql`${table.categoryId} is null and ${table.transferAccountId} is null`),
    uniqueIndex("transaction_lines_one_transfer")
      .on(table.transactionId)
      .where(sql`${table.transferAccountId} is not null`),
  ],
);

export const lineTags = sqliteTable(
  "line_tags",
  {
    lineId: text("line_id")
      .notNull()
      .references(() => transactionLines.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.lineId, table.tagId] }), index("line_tags_tag").on(table.tagId)],
);
