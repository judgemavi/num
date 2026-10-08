import { fromMinorUnits, mortgagePrefillLines, mortgagePrefillSchema, toMinorUnits, type MoneyDirection, type WhatChoice } from "@num/shared";
import { useEffect, useRef } from "react";
import { apiRequest } from "@/request";
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
  const editedRef = useRef(edited);
  const applied = useRef(false);
  const key = `${fromAccountId}|${toAccountId ?? ""}|${date}|${direction}|${choice}|${enabled}|${edited}`;

  useEffect(() => {
    amountRef.current = amount;
    onPrefillRef.current = onPrefill;
    editedRef.current = edited;
  });

  useEffect(() => {
    const asking = choice === "split" || toAccountId !== null;
    if (!enabled || edited || applied.current || direction !== "out" || !asking || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }
    const params = new URLSearchParams({ fromAccountId, date });
    if (toAccountId) {
      params.set("toAccountId", toAccountId);
    }
    let cancel = false;
    void apiRequest(`/api/mortgage-prefill?${params.toString()}`, mortgagePrefillSchema.nullable()).then((result) => {
      if (cancel || editedRef.current || applied.current || !result.ok || result.data === null) {
        return;
      }
      const split = result.data;
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
            direction: "out",
            categoryId: null,
            transferAccountId: split.mortgageAccountId,
          },
          {
            key: crypto.randomUUID(),
            amount: fromMinorUnits(currency, amounts.interest),
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
  }, [key, choice, currency, date, direction, edited, enabled, fromAccountId, toAccountId]);

  return null;
}
