import { fromMinorUnits, toMinorUnits } from "@num/shared";

export type LineDraft = {
  key: string;
  amount: string;
  memo: string;
  categoryId: string | null;
  transferAccountId: string | null;
  tagIds: string[];
};

function readAmount(currency: string, text: string): number {
  return toMinorUnits(currency, text.trim());
}

export function emptyLine(currency: string): LineDraft {
  return {
    key: crypto.randomUUID(),
    amount: fromMinorUnits(currency, 0),
    memo: "",
    categoryId: null,
    transferAccountId: null,
    tagIds: [],
  };
}

export function lineAmountError(currency: string, lines: LineDraft[]): string | null {
  for (const line of lines) {
    try {
      readAmount(currency, line.amount);
    } catch (error) {
      if (error instanceof Error && error.message === "Amount has too many decimal places") {
        return "A line amount has too many decimal places.";
      }
      return "Enter each line amount as a number.";
    }
  }
  return null;
}

export function lineAmounts(currency: string, lines: LineDraft[]): number[] {
  return lines.map((line) => readAmount(currency, line.amount));
}
