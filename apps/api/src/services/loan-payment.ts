import { accounts, categories, mortgageTerms, transactionLines, transactions } from "@num/db";
import { mortgageSplitForDate } from "@num/shared";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { activeValuations, storedOpeningDate } from "./mortgage";
import { lineCount, literal } from "./transaction-sql";
import type { Reader } from "./write";

const principalLine = alias(transactionLines, "principal_line");
const interestLine = alias(transactionLines, "interest_line");

/** The interest of the payment on `date` in the schedule of a mortgage with terms. Null without terms or interest. */
function scheduleInterest(db: Reader, account: typeof accounts.$inferSelect, date: string) {
  const terms = db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, account.id)).get();
  if (!terms) {
    return { terms: null, interest: null };
  }
  const split = mortgageSplitForDate({
    terms,
    opening: { balance: account.openingBalance, date: storedOpeningDate(account) },
    valuations: activeValuations(db, account.id),
    date,
    // The schedule does not change with the account that pays.
    fromAccountId: terms.paymentAccountId,
    toAccountId: account.id,
    step: bookStep(db),
  });
  return { terms, interest: split && split.interest > 0 ? split.interest : null };
}

/** The active interest category of the latest loan payment to the account. */
function lastInterestCategory(db: Reader, loanAccountId: string) {
  const row = db
    .select({ categoryId: interestLine.categoryId })
    .from(transactions)
    .innerJoin(principalLine, and(eq(principalLine.transactionId, transactions.id), eq(principalLine.transferAccountId, loanAccountId)))
    .innerJoin(interestLine, and(eq(interestLine.transactionId, transactions.id), isNotNull(interestLine.categoryId)))
    .innerJoin(categories, and(eq(categories.id, interestLine.categoryId), isNull(categories.archivedAt)))
    .where(and(eq(transactions.mirror, literal(0)), lt(transactions.amount, literal(0)), eq(lineCount(transactions.id), literal(2))))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .get();
  return row?.categoryId ?? null;
}

/**
 * The start values of the Loan payment fields (decision 0053). The interest comes from the schedule of a mortgage
 * with terms. The interest category is the one of the terms, else the one of the latest loan payment to the account.
 */
export function loanPaymentDefaults(db: Reader, loanAccountId: string, date: string) {
  const account = db.select().from(accounts).where(eq(accounts.id, loanAccountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (account.kind !== "mortgage" && account.kind !== "loan") {
    return { interest: null, interestCategoryId: null };
  }
  const { terms, interest } = scheduleInterest(db, account, date);
  return { interest, interestCategoryId: terms?.interestCategoryId ?? lastInterestCategory(db, loanAccountId) };
}
