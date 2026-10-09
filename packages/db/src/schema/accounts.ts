import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { categories } from "./categories";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution"),
  kind: text("kind").notNull(),
  onBudget: integer("on_budget", { mode: "boolean" }).notNull(),
  openingDate: text("opening_date").notNull(),
  openingBalance: integer("opening_balance").notNull(),
  archivedAt: text("archived_at"),
  paymentPolicy: text("payment_policy"),
  fixedPayment: integer("fixed_payment"),
  interestRateMilliPct: integer("interest_rate_milli_pct"),
  importPreset: text("import_preset"),
  columnMap: text("column_map"),
});

export const mortgageTerms = sqliteTable("mortgage_terms", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  principal: integer("principal").notNull(),
  principalAsOf: text("principal_as_of").notNull(),
  rateMilliPct: integer("rate_milli_pct").notNull(),
  compounding: text("compounding").notNull(),
  paymentAmount: integer("payment_amount").notNull(),
  paymentFrequency: text("payment_frequency").notNull(),
  firstPaymentDate: text("first_payment_date").notNull(),
  termEnd: text("term_end").notNull(),
  amortizationMonthsRemaining: integer("amortization_months_remaining").notNull(),
  paymentAccountId: text("payment_account_id")
    .notNull()
    .references(() => accounts.id),
  interestCategoryId: text("interest_category_id")
    .notNull()
    .references(() => categories.id),
  propertyAccountId: text("property_account_id").references(() => accounts.id),
});
