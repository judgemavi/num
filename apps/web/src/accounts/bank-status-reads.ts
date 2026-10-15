import type { AccountKind, BankStatus } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { formatBalance } from "@/accounts/format";
import { bankStatusesQuery } from "@/api/bank-balances";
import { useBookCurrency } from "@/editors/lookups";
import { formatDate } from "@/transactions/format";

/** The status of one account. Null when the account has no bank balance. */
export function useBankStatus(accountId: string) {
  return useSuspenseQuery({ ...bankStatusesQuery(), select: (list) => list.items.find((item) => item.accountId === accountId) ?? null }).data;
}

export function useBankStatusText(kind: AccountKind, status: BankStatus) {
  const currency = useBookCurrency();
  if (status.difference === 0) {
    return `Matches your bank on ${formatDate(status.date)}`;
  }
  const different = formatBalance(currency, "chequing", Math.abs(status.difference));
  return `Your bank says ${formatBalance(currency, kind, status.bankBalance)}. Num says ${formatBalance(currency, kind, status.calculatedBalance)}. ${different} different.`;
}
