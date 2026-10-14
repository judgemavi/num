import { fromMinorUnits, isIsoDate, mortgagePrefillLines, toMinorUnits, type MoneyDirection, type WhatChoice } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { mortgagePrefillQuery } from "@/api/mortgage";
import type { SplitLine } from "@/transactions/what-choice";

type MortgagePayment = {
  /** False when the form must not fill the lines: the person changed them, or the form filled them before. */
  open: boolean;
  choice: WhatChoice;
  direction: MoneyDirection;
  fromAccountId: string;
  toAccountId: string | null;
  date: string;
};

/**
 * The principal and the interest of the mortgage payment that the form shows. The result is `undefined` when the form
 * does not show a mortgage payment from the payment account, and while the read is in progress.
 * Old data from the cache is not a result: the split waits for the read to complete.
 */
export function useMortgageSplit({ open, choice, direction, fromAccountId, toAccountId, date }: MortgagePayment) {
  const asking = choice === "split" || toAccountId !== null;
  const wanted = open && direction === "out" && asking && fromAccountId.length > 0 && isIsoDate(date);
  const prefill = useQuery(mortgagePrefillQuery({ fromAccountId, toAccountId, date }, wanted));
  return wanted && !prefill.isFetching ? (prefill.data ?? undefined) : undefined;
}

/**
 * The lines of a mortgage payment: the principal goes to the mortgage account and the interest goes to its category.
 * With an amount in the form, the interest stays and the principal is the remainder. With no amount, `total` is the
 * payment of the schedule, for the amount field.
 */
export function mortgageSplitFill(currency: string, split: NonNullable<ReturnType<typeof useMortgageSplit>>, amountText: string): { total: string | null; lines: SplitLine[] } {
  let totalMinor: number | null = null;
  if (amountText.trim().length > 0) {
    try {
      totalMinor = toMinorUnits(currency, amountText.trim());
    } catch {
      totalMinor = null;
    }
  }
  const amounts = mortgagePrefillLines(split.interest, split.principal, totalMinor);
  return {
    total: totalMinor === null ? fromMinorUnits(currency, split.payment) : null,
    lines: [
      {
        key: crypto.randomUUID(),
        amount: fromMinorUnits(currency, amounts.principal),
        opposite: false,
        edited: false,
        categoryId: null,
        transferAccountId: split.mortgageAccountId,
      },
      {
        key: crypto.randomUUID(),
        amount: fromMinorUnits(currency, amounts.interest),
        opposite: false,
        edited: false,
        categoryId: split.interestCategoryId,
        transferAccountId: null,
      },
    ],
  };
}
