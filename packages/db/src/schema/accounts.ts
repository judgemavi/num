import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accountKinds, compounding, paymentFrequencies, paymentPolicies } from "./codes";
import { categories } from "./categories";
import { isoDate, nullOrDayOfMonth, nullOrOneOf, oneOf } from "./sql";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    institution: text("institution"),
    kind: text("kind").notNull(),
    onBudget: integer("on_budget", { mode: "boolean" }).notNull(),
    openingDate: text("opening_date").notNull(),
    openingBalance: integer("opening_balance").notNull(),
    archivedAt: text("archived_at"),
    creditLimit: integer("credit_limit"),
    statementDay: integer("statement_day"),
    dueDay: integer("due_day"),
    paymentPolicy: text("payment_policy"),
    fixedPayment: integer("fixed_payment"),
    interestRateBps: integer("interest_rate_bps"),
  },
  (table) => [
    check("accounts_kind", oneOf(table.kind, accountKinds)),
    check("accounts_opening_date", isoDate(table.openingDate)),
    check("accounts_statement_day", nullOrDayOfMonth(table.statementDay)),
    check("accounts_due_day", nullOrDayOfMonth(table.dueDay)),
    check("accounts_payment_policy", nullOrOneOf(table.paymentPolicy, paymentPolicies)),
    check(
      "accounts_interest_rate",
      sql`${table.interestRateBps} is null or ${table.interestRateBps} >= 0`,
    ),
    check(
      "accounts_card_fields",
      sql`(
        ${table.kind} = 'credit_card'
        and ${table.paymentPolicy} is not null
        and (${table.paymentPolicy} <> 'fixed' or ${table.fixedPayment} is not null)
      ) or (
        ${table.kind} <> 'credit_card'
        and ${table.creditLimit} is null
        and ${table.statementDay} is null
        and ${table.dueDay} is null
        and ${table.paymentPolicy} is null
        and ${table.fixedPayment} is null
      )`,
    ),
  ],
);

export const mortgageTerms = sqliteTable(
  "mortgage_terms",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => accounts.id),
    principal: integer("principal").notNull(),
    principalAsOf: text("principal_as_of").notNull(),
    rateBps: integer("rate_bps").notNull(),
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
  },
  (table) => [
    check("mortgage_terms_rate", sql`${table.rateBps} >= 0`),
    check("mortgage_terms_months", sql`${table.amortizationMonthsRemaining} >= 0`),
    check("mortgage_terms_compounding", oneOf(table.compounding, compounding)),
    check("mortgage_terms_frequency", oneOf(table.paymentFrequency, paymentFrequencies)),
    check("mortgage_terms_principal_as_of", isoDate(table.principalAsOf)),
    check("mortgage_terms_first_payment", isoDate(table.firstPaymentDate)),
    check("mortgage_terms_term_end", isoDate(table.termEnd)),
  ],
);
