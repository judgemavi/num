import { fromMinorUnits, mortgagePrefillLines, toMinorUnits, type MoneyDirection, type WhatChoice } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { mortgagePrefillQuery } from "@/api/mortgage";
import type { SplitLine } from "@/transactions/what-choice";

type Prefill = {
  total: string | null;
  lines: SplitLine[];
};

type MortgageSplitWatchProps = {
  enabled: boolean;
  edited: boolean;
  choice: WhatChoice;
  fromAccountId: string;
  toAccountId: string | null;
  date: string;
  direction: MoneyDirection;
  currency: string;
  amount: string;
  onPrefill: (prefill: Prefill) => void;
};

export function MortgageSplitWatch({
  enabled,
  edited,
  choice,
  fromAccountId,
  toAccountId,
  date,
  direction,
  currency,
  amount,
  onPrefill,
}: MortgageSplitWatchProps) {
  const amountRef = useRef(amount);
  const onPrefillRef = useRef(onPrefill);
  const applied = useRef(false);
  const asking = choice === "split" || toAccountId !== null;
  const wanted = enabled && !edited && direction === "out" && asking && fromAccountId.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const prefill = useQuery(mortgagePrefillQuery({ fromAccountId, toAccountId, date }, wanted));
  // Old data from the cache is not applied. The split waits for the read to complete.
  const split = prefill.isFetching ? undefined : prefill.data;

  useEffect(() => {
    amountRef.current = amount;
    onPrefillRef.current = onPrefill;
  });

  useEffect(() => {
    if (!wanted || applied.current || !split) {
      return;
    }
    let totalMinor: number | null = null;
    if (amountRef.current.trim().length > 0) {
      try {
        totalMinor = toMinorUnits(currency, amountRef.current.trim());
      } catch {
        totalMinor = null;
      }
    }
    const amounts = mortgagePrefillLines(split.interest, split.principal, totalMinor);
    applied.current = true;
    onPrefillRef.current({
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
    });
  }, [wanted, split, currency]);

  return null;
}
