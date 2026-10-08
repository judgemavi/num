import type { MoneyDirection } from "@num/shared";
import { signedAmount, toMinorUnits } from "@num/shared";
import type { WhatChoice } from "@num/shared";

export type { WhatChoice };

export type SplitLine = {
  key: string;
  amount: string;
  direction: MoneyDirection;
  categoryId: string | null;
  transferAccountId: string | null;
};

export function splitRemainder(currency: string, totalMinor: number, lines: SplitLine[]): number | null {
  let assigned = 0;
  for (const line of lines) {
    if (line.amount.trim().length === 0) {
      return null;
    }
    try {
      const minor = toMinorUnits(currency, line.amount.trim());
      if (minor < 0) {
        return null;
      }
      assigned += signedAmount(line.direction, minor);
    } catch {
      return null;
    }
  }
  return totalMinor - assigned;
}
