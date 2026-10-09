import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { categories, merchants } from "./categories";
import { transactions } from "./ledger";

export const recurringPlans = sqliteTable("recurring_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  expectedAmount: integer("expected_amount").notNull(),
  tolerance: integer("tolerance").notNull(),
  amountMode: text("amount_mode").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  transferAccountId: text("transfer_account_id").references(() => accounts.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  startDate: text("start_date").notNull(),
  freq: text("freq").notNull(),
  interval: integer("interval").notNull(),
  monthDay: integer("month_day"),
  businessDayShift: text("business_day_shift").notNull(),
  endDate: text("end_date"),
  active: integer("active", { mode: "boolean" }).notNull(),
  fundsBuckets: integer("funds_buckets", { mode: "boolean" }).notNull(),
  archivedAt: text("archived_at"),
});

export const occurrenceLinks = sqliteTable(
  "occurrence_links",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => recurringPlans.id),
    dueDate: text("due_date").notNull(),
    transactionId: text("transaction_id")
      .unique()
      .references(() => transactions.id),
    skipped: integer("skipped", { mode: "boolean" }).notNull(),
    reason: text("reason"),
  },
  (table) => [uniqueIndex("occurrence_links_plan_due_date").on(table.planId, table.dueDate)],
);
