import { z } from "zod";
import { currencyMinorUnits, type CurrencyCode } from "./currency-units";

export type { CurrencyCode };
export { currencyMinorUnits };

const currencyCodeList = Object.keys(currencyMinorUnits) as [CurrencyCode, ...CurrencyCode[]];

export const currencyCodes: readonly CurrencyCode[] = currencyCodeList;

export function minorUnitDigits(code: string): number | undefined {
  if (!Object.hasOwn(currencyMinorUnits, code)) {
    return undefined;
  }
  return currencyMinorUnits[code as CurrencyCode];
}

const decimalAmount = /^(-?)(\d+)(?:\.(\d+))?$/;

export function toMinorUnits(code: string, amount: string): number {
  const digits = minorUnitDigits(code);
  if (digits === undefined) {
    throw new Error("Unknown currency");
  }

  const match = decimalAmount.exec(amount.trim());
  if (!match) {
    throw new Error("Amount is not a decimal number");
  }

  const fraction = match[3] ?? "";
  if (fraction.length > digits) {
    throw new Error("Amount has too many decimal places");
  }

  const scaled = `${match[2]}${fraction.padEnd(digits, "0")}`;
  const minor = BigInt(scaled) * (match[1] === "-" ? -1n : 1n);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (minor > max || minor < -max) {
    throw new Error("Amount is too large");
  }
  return Number(minor);
}

export const currencyCodeSchema = z.enum(currencyCodeList);
