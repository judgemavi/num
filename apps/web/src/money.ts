import { minorUnitDigits } from "@num/shared";

function minorToNumber(minor: number, digits: number): number {
  const sign = minor < 0 ? -1 : 1;
  const text = Math.abs(minor).toString().padStart(digits + 1, "0");
  if (digits === 0) {
    return sign * Number(text);
  }
  const whole = text.slice(0, -digits);
  const fraction = text.slice(-digits);
  return sign * Number(`${whole}.${fraction}`);
}

function digitsFor(currency: string): number {
  const digits = minorUnitDigits(currency);
  if (digits === undefined) {
    throw new Error("Unknown currency");
  }
  return digits;
}

export type MoneyDisplay = "book" | "other";

function currencyDisplay(display: MoneyDisplay): "narrowSymbol" | "code" {
  return display === "book" ? "narrowSymbol" : "code";
}

export function formatMoney(currency: string, minor: number, display: MoneyDisplay = "book"): string {
  const digits = digitsFor(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: currencyDisplay(display),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToNumber(minor, digits));
}

export function moneyParts(currency: string, minor: number, display: MoneyDisplay = "book"): { currency: string; integer: string; fraction: string } {
  const digits = digitsFor(currency);
  const parts = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: currencyDisplay(display),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(minorToNumber(Math.abs(minor), digits));
  let symbol = "";
  let integer = "";
  let fraction = "";
  for (const part of parts) {
    if (part.type === "currency") {
      symbol += part.value;
    } else if (part.type === "integer" || part.type === "group") {
      integer += part.value;
    } else if (part.type === "decimal" || part.type === "fraction") {
      fraction += part.value;
    }
  }
  return { currency: symbol, integer, fraction };
}
