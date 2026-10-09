import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { categories, merchants } from "./categories";
import { amountModes, businessDayShifts, planFrequencies, planKinds } from "./codes";
import { transactions } from "./ledger";
import { isoDate, nullOrIsoDate, oneOf } from "./sql";

export const recurringPlans = sqliteTable(
  "recurring_plans",
  {
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
  },
  (table) => [
    check("recurring_plans_kind", oneOf(table.kind, planKinds)),
    check("recurring_plans_amount_mode", oneOf(table.amountMode, amountModes)),
    check("recurring_plans_freq", oneOf(table.freq, planFrequencies)),
    check("recurring_plans_shift", oneOf(table.businessDayShift, businessDayShifts)),
    check("recurring_plans_tolerance", sql`${table.tolerance} >= 0`),
    check("recurring_plans_interval", sql`${table.interval} >= 1`),
    check("recurring_plans_start_date", isoDate(table.startDate)),
    check("recurring_plans_end_date", nullOrIsoDate(table.endDate)),
    check(
      "recurring_plans_month_day",
      sql`${table.monthDay} is null or (
        ${table.freq} <> 'weekly'
        and (${table.monthDay} = -1 or (${table.monthDay} between 1 and 31))
      )`,
    ),
    check(
      "recurring_plans_kind_fields",
      sql`(
        ${table.kind} = 'transfer'
        and ${table.transferAccountId} is not null
        and ${table.transferAccountId} <> ${table.accountId}
        and ${table.categoryId} is null
      ) or (
        ${table.kind} <> 'transfer'
        and ${table.transferAccountId} is null
      )`,
    ),
    check(
      "recurring_plans_funds_buckets",
      sql`${table.fundsBuckets} = 0 or ${table.kind} = 'income'`,
    ),
  ],
);

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
  (table) => [
    check("occurrence_links_due_date", isoDate(table.dueDate)),
    check(
      "occurrence_links_result",
      sql`(
        ${table.transactionId} is not null
        and ${table.skipped} = 0
        and ${table.reason} is null
      ) or (
        ${table.transactionId} is null
        and ${table.skipped} = 1
        and ${table.reason} is not null
      )`,
    ),
    uniqueIndex("occurrence_links_plan_due_date").on(table.planId, table.dueDate),
  ],
);
