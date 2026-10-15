import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { amountModes, businessDayShifts, planFrequencies } from "@num/shared";
import { accounts } from "./accounts";
import { buckets } from "./buckets";
import { categories, merchants } from "./categories";
import { transactions } from "./ledger";

/** The schedule of a commitment or an income bucket. The bucket has the name, the archive state and the kind. */
export const schedules = sqliteTable("schedules", {
  bucketId: text("bucket_id")
    .primaryKey()
    .references(() => buckets.id),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  expectedAmount: integer("expected_amount").notNull(),
  tolerance: integer("tolerance").notNull(),
  amountMode: text("amount_mode", { enum: amountModes }).notNull(),
  categoryId: text("category_id").references(() => categories.id),
  transferAccountId: text("transfer_account_id").references(() => accounts.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  startDate: text("start_date").notNull(),
  freq: text("freq", { enum: planFrequencies }).notNull(),
  interval: integer("interval").notNull(),
  monthDay: integer("month_day"),
  businessDayShift: text("business_day_shift", { enum: businessDayShifts }).notNull(),
  endDate: text("end_date"),
  payday: integer("payday", { mode: "boolean" }).notNull(),
});
export type ScheduleRow = typeof schedules.$inferSelect;

export const occurrenceLinks = sqliteTable(
  "occurrence_links",
  {
    id: text("id").primaryKey(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => schedules.bucketId),
    dueDate: text("due_date").notNull(),
    transactionId: text("transaction_id")
      .unique()
      .references(() => transactions.id),
    skipped: integer("skipped", { mode: "boolean" }).notNull(),
    reason: text("reason"),
  },
  (table) => [uniqueIndex("occurrence_links_bucket_due_date").on(table.bucketId, table.dueDate)],
);
export type OccurrenceLinkRow = typeof occurrenceLinks.$inferSelect;
