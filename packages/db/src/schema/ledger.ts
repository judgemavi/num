import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { categories, merchants, tags } from "./categories";
import { transactionSources, transactionStatuses } from "./codes";
import { importRows } from "./imports";
import { isoDate, oneOf } from "./sql";

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
    notes: text("notes"),
    payeeRaw: text("payee_raw").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    importRowId: text("import_row_id")
      .unique()
      .references(() => importRows.id),
    transferPeerId: text("transfer_peer_id")
      .unique()
      .references((): AnySQLiteColumn => transactions.id),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    check("transactions_date", isoDate(table.date)),
    check("transactions_status", oneOf(table.status, transactionStatuses)),
    check("transactions_source", oneOf(table.source, transactionSources)),
    check(
      "transactions_transfer_peer",
      sql`${table.transferPeerId} is null or ${table.transferPeerId} <> ${table.id}`,
    ),
    index("transactions_account_date").on(table.accountId, table.date),
  ],
);

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
    check(
      "transaction_lines_category_or_transfer",
      sql`${table.categoryId} is null or ${table.transferAccountId} is null`,
    ),
    index("transaction_lines_transaction").on(table.transactionId),
    index("transaction_lines_category").on(table.categoryId),
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
  (table) => [primaryKey({ columns: [table.lineId, table.tagId] })],
);
