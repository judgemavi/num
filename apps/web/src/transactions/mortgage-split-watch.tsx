import { fromMinorUnits, mortgagePrefillSchema, type MoneyDirection } from "@num/shared";
import { useEffect, useRef } from "react";
import { apiRequest } from "@/request";
import type { SplitLine } from "@/transactions/what-choice";

type Prefill = {
  total: string | null;
  lines: SplitLine[];
};

type MortgageSplitWatchProps = {
  enabled: boolean;
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
  const key = `${fromAccountId}|${toAccountId ?? ""}|${date}|${direction}|${enabled}`;

  useEffect(() => {
    amountRef.current = amount;
    onPrefillRef.current = onPrefill;
  });

  useEffect(() => {
    if (!enabled || direction !== "out" || !toAccountId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }
    const params = new URLSearchParams({ fromAccountId, toAccountId, date });
    let cancel = false;
    void apiRequest(`/api/mortgage-prefill?${params.toString()}`, mortgagePrefillSchema.nullable()).then((result) => {
      if (cancel || !result.ok || result.data === null) {
        return;
      }
      const split = result.data;
      const total = amountRef.current.trim().length === 0 ? fromMinorUnits(currency, split.payment) : null;
      onPrefillRef.current({
        total,
        lines: [
          {
            key: crypto.randomUUID(),
            amount: fromMinorUnits(currency, split.principal),
            direction: "out",
            categoryId: null,
            transferAccountId: toAccountId,
          },
          {
            key: crypto.randomUUID(),
            amount: fromMinorUnits(currency, split.interest),
            direction: "out",
            categoryId: split.interestCategoryId,
            transferAccountId: null,
          },
        ],
      });
    });
    return () => {
      cancel = true;
    };
  }, [key, currency, date, direction, enabled, fromAccountId, toAccountId]);

  return null;
}
