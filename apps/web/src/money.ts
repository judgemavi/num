import { minorUnitDigits } from "@num/shared";

function minorToNumber(minor: number, digits: number) {
  const sign = minor < 0 ? -1 : 1;
  const text = Math.abs(minor).toString().padStart(digits + 1, "0");
  if (digits === 0) {
    return sign * Number(text);
  }
  const whole = text.slice(0, -digits);
  const fraction = text.slice(-digits);
  return sign * Number(`${whole}.${fraction}`);
}

function digitsFor(currency: string) {
  const digits = minorUnitDigits(currency);
  if (digits === undefined) {
    throw new Error("Unknown currency");
  }
  return digits;
}

export function formatMoney(currency: string, minor: number): string {
  const digits = digitsFor(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToNumber(minor, digits));
}

export function moneyParts(currency: string, minor: number): { currency: string; integer: string; fraction: string } {
  const digits = digitsFor(currency);
  const parts = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
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
