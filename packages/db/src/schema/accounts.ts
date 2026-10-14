import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accountKinds, compounding, paymentFrequencies, paymentPolicies, type ColumnMap } from "@num/shared";
import { categories } from "./categories";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    institution: text("institution"),
    kind: text("kind", { enum: accountKinds }).notNull(),
    onBudget: integer("on_budget", { mode: "boolean" }).notNull(),
    openingDate: text("opening_date"),
    openingBalance: integer("opening_balance").notNull(),
    archivedAt: text("archived_at"),
    paymentPolicy: text("payment_policy", { enum: paymentPolicies }),
    fixedPayment: integer("fixed_payment"),
    interestRateMilliPct: integer("interest_rate_milli_pct"),
    importPreset: text("import_preset"),
    columnMap: text("column_map", { mode: "json" }).$type<ColumnMap>(),
    createdAt: text("created_at").notNull(),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [index("accounts_sort_key_idx").on(table.sortKey, table.name, table.id)],
);
export type AccountRow = typeof accounts.$inferSelect;

export const mortgageTerms = sqliteTable("mortgage_terms", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  rateMilliPct: integer("rate_milli_pct").notNull(),
  compounding: text("compounding", { enum: compounding }).notNull(),
  paymentAmount: integer("payment_amount").notNull(),
  paymentFrequency: text("payment_frequency", { enum: paymentFrequencies }).notNull(),
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
export type MortgageTermRow = typeof mortgageTerms.$inferSelect;
