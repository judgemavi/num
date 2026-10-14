import type { MoneyDirection } from "@num/shared";
import { fromMinorUnits, signedAmount, toMinorUnits } from "@num/shared";

/** `opposite` is true when the line goes the other way than the transaction. `edited` is true once the user typed the amount. */
export type SplitLine = {
  key: string;
  amount: string;
  opposite: boolean;
  edited: boolean;
  categoryId: string | null;
  transferAccountId: string | null;
};

export function lineDirection(direction: MoneyDirection, line: SplitLine): MoneyDirection {
  if (!line.opposite) {
    return direction;
  }
  return direction === "out" ? "in" : "out";
}

/** The signed amount of a line. Null when the text is not a valid amount. A blank line counts as zero. */
function lineSigned(currency: string, direction: MoneyDirection, line: SplitLine) {
  const text = line.amount.trim();
  if (text.length === 0) {
    return 0;
  }
  try {
    const minor = toMinorUnits(currency, text);
    return minor < 0 ? null : signedAmount(lineDirection(direction, line), minor);
  } catch {
    return null;
  }
}

export function splitBlank(lines: SplitLine[]): boolean {
  return lines.some((line) => line.amount.trim().length === 0);
}

/** What is left to assign. Null when a line has an amount that is not valid. */
export function splitRemainder(currency: string, totalMinor: number, direction: MoneyDirection, lines: SplitLine[]): number | null {
  let assigned = 0;
  for (const line of lines) {
    const signed = lineSigned(currency, direction, line);
    if (signed === null) {
      return null;
    }
    assigned += signed;
  }
  return totalMinor - assigned;
}

/** The amount text that makes `signed` on this line, or "" when the line cannot hold it. */
function textFor(currency: string, direction: MoneyDirection, line: SplitLine, signed: number) {
  const magnitude = signed * signedAmount(lineDirection(direction, line), 1);
  return magnitude > 0 ? fromMinorUnits(currency, magnitude) : "";
}

/** The user typed an amount. With two lines, the other line takes the rest until the user edits it. */
export function editLineAmount(currency: string, totalMinor: number | null, direction: MoneyDirection, lines: SplitLine[], key: string, text: string): SplitLine[] {
  const changed = lines.map((line) => (line.key === key ? { ...line, amount: text, edited: true } : line));
  const [first, second] = changed;
  if (changed.length !== 2 || !first || !second || totalMinor === null) {
    return changed;
  }
  const edited = first.key === key ? first : second;
  const other = first.key === key ? second : first;
  const signed = lineSigned(currency, direction, edited);
  if (other.edited || signed === null) {
    return changed;
  }
  const amount = textFor(currency, direction, other, totalMinor - signed);
  return changed.map((line) => (line.key === other.key ? { ...line, amount } : line));
}

/** A new line starts with what is left. */
export function addedLine(currency: string, totalMinor: number | null, direction: MoneyDirection, lines: SplitLine[]): SplitLine {
  const left = totalMinor === null ? null : splitRemainder(currency, totalMinor, direction, lines);
  const line: SplitLine = { key: crypto.randomUUID(), amount: "", opposite: false, edited: false, categoryId: null, transferAccountId: null };
  return left === null ? line : { ...line, amount: textFor(currency, direction, line, left) };
}

/** The last line takes what is left. Null when the last line cannot hold it. */
export function restOnLastLine(currency: string, totalMinor: number, direction: MoneyDirection, lines: SplitLine[]): SplitLine[] | null {
  const last = lines.at(-1);
  const left = splitRemainder(currency, totalMinor, direction, lines);
  const current = last ? lineSigned(currency, direction, last) : null;
  if (!last || left === null || current === null || left === 0) {
    return null;
  }
  const amount = textFor(currency, direction, last, current + left);
  return amount.length === 0 ? null : lines.map((line) => (line.key === last.key ? { ...line, amount, edited: true } : line));
}
