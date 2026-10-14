import { currencyCodes, milliunitDigits, type DecimalSeparator } from "@num/shared";

export type AmountProblem = "amount_unreadable" | "too_many_decimals" | "amount_too_large" | "sign_marker";

export type AmountRead =
  | { kind: "empty" }
  | { kind: "value"; amount: number }
  | { kind: "error"; reason: AmountProblem };

const numberPattern = /^(\d+)(?:\.(\d+))?$/;
const signMarker = /\b(?:CR|DR)\b/i;
const currencyWords = new Set<string>([...currencyCodes.map((code) => code.toLowerCase()), "kr"]);

function normalizeLeadingSign(text: string) {
  return text.replace(/(^|[^\d])[−–](?=\s*\d)/g, "$1-");
}

function hasUnknownLetters(text: string) {
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    if (!currencyWords.has(word.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function invalid(reason: AmountProblem): AmountRead {
  return { kind: "error", reason };
}

/** Reads a statement amount as milliunits. `digits` is the number of minor-unit digits of the book currency. */
export function readAmount(raw: string, digits: number, decimal: DecimalSeparator): AmountRead {
  if (!Number.isInteger(digits) || digits < 0 || digits > milliunitDigits) {
    throw new Error("Minor unit digits are not valid");
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: "empty" };
  }
  if (signMarker.test(trimmed)) {
    return invalid("sign_marker");
  }

  let negative = false;
  let text = normalizeLeadingSign(trimmed);
  if (hasUnknownLetters(text)) {
    return invalid("amount_unreadable");
  }
  text = text.replace(/\p{L}+/gu, "").replace(/[^\d.,+\-()]/g, "");
  if (!/\d/.test(text)) {
    return invalid("amount_unreadable");
  }

  if (text.startsWith("(") && text.endsWith(")") && text.length > 2) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("+")) {
    text = text.slice(1);
  } else if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  if (/[+\-()]/.test(text)) {
    return invalid("amount_unreadable");
  }

  if (decimal === ".") {
    text = text.replace(/,/g, "");
  } else {
    text = text.replace(/\./g, "");
    const parts = text.split(",");
    if (parts.length > 2) {
      return invalid("amount_unreadable");
    }
    text = parts.length === 2 ? `${parts[0] ?? ""}.${parts[1] ?? ""}` : text;
  }
  if (text.split(".").length > 2) {
    return invalid("amount_unreadable");
  }

  const match = numberPattern.exec(text);
  if (!match?.[1]) {
    return invalid("amount_unreadable");
  }

  const fraction = match[2] ?? "";
  if (fraction.length > digits) {
    return invalid("too_many_decimals");
  }

  const scaled = BigInt(`${match[1]}${fraction.padEnd(milliunitDigits, "0")}`);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    return invalid("amount_too_large");
  }

  const amount = Number(scaled);
  return { kind: "value", amount: negative ? -amount : amount };
}
