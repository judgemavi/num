import { accounts, bankBalances, importBatches, type AccountRow } from "@num/db";
import { openingFromBankBalance, openingFromFirstRow, type OpeningSuggestion } from "@num/shared";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { clearedBalancesAt, valuationAccountIds } from "./account-balance";
import { hasTerms } from "./mortgage-terms";
import { earliestTransactionDate, effectiveOpeningDate } from "./opening-date";
import type { Reader } from "./write";

type OpeningAccount = Pick<AccountRow, "id" | "kind" | "openingBalance" | "openingDate">;

/** True when the account has a bank balance (before `before`, when given) that is equal to its cleared balance. */
function hasMatchingBankBalance(db: Reader, account: OpeningAccount, before?: string) {
  const filters = [eq(bankBalances.accountId, account.id)];
  if (before !== undefined) {
    filters.push(lt(bankBalances.date, before));
  }
  const rows = db.select({ date: bankBalances.date, balance: bankBalances.balance }).from(bankBalances)
    .where(and(...filters)).all();
  const cleared = clearedBalancesAt(db, rows.map((row) => ({ account, date: row.date })));
  return rows.some((row, index) => cleared[index] === row.balance);
}

function hadRunningBalanceImport(db: Reader, accountId: string) {
  return (
    db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.accountId, accountId),
          eq(importBatches.parser, "csv"),
          isNull(importBatches.undoneAt),
          isNotNull(importBatches.closingBalance),
        ),
      )
      .limit(1)
      .get() !== undefined
  );
}

export function importOpeningSuggestion(
  db: Reader,
  accountId: string,
  firstRow: { date: string; amount: number; balance: number } | null,
): OpeningSuggestion | null {
  if (!firstRow || hasTerms(db, accountId) || hadRunningBalanceImport(db, accountId)) {
    return null;
  }
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account || hasMatchingBankBalance(db, account)) {
    return null;
  }
  return openingFromFirstRow(firstRow);
}

export function bankOpeningSuggestion(
  db: Reader,
  account: OpeningAccount,
  latest: { date: string; balance: number },
  cleared: number,
): OpeningSuggestion | null {
  if (hasTerms(db, account.id) || valuationAccountIds(db, [account.id], latest.date).has(account.id)) {
    return null;
  }
  const first = earliestTransactionDate(db, account.id);
  return openingFromBankBalance({
    hasMatchingBankBalance: hasMatchingBankBalance(db, account, latest.date),
    openingBalance: account.openingBalance,
    clearedBalance: cleared,
    bankBalance: latest.balance,
    date: effectiveOpeningDate(db, { id: account.id, openingDate: first ? null : account.openingDate }),
  });
}
