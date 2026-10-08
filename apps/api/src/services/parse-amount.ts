import type { DecimalSeparator } from "@num/shared";

export type AmountProblem = "amount_unreadable" | "too_many_decimals" | "amount_too_large";

export type AmountRead =
  | { kind: "empty" }
  | { kind: "value"; minor: number }
  | { kind: "error"; reason: AmountProblem };

const numberPattern = /^(\d+)(?:\.(\d+))?$/;

function invalid(reason: AmountProblem): AmountRead {
  return { kind: "error", reason };
}

export function readMinorAmount(raw: string, digits: number, decimal: DecimalSeparator): AmountRead {
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) {
    throw new Error("Minor unit digits are not valid");
  }

  if (raw.trim().length === 0) {
    return { kind: "empty" };
  }

  let negative = false;
  let text = raw.replace(/[^\d.,+\-()]/g, "");
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

  const scaled = BigInt(`${match[1]}${fraction.padEnd(digits, "0")}`);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    return invalid("amount_too_large");
  }

  const minor = Number(scaled);
  return { kind: "value", minor: negative ? -minor : minor };
}
