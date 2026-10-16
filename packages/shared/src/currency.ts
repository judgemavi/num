import { z } from "zod";
import { currencyMinorUnits, type CurrencyCode } from "./currency-units";

export type { CurrencyCode };

const currencyCodeList = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BOV",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHE",
  "CHF",
  "CHW",
  "CLP",
  "CNY",
  "COP",
  "COU",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MXV",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "USN",
  "UYI",
  "UYU",
  "UZS",
  "VED",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAD",
  "XAF",
  "XCD",
  "XCG",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
] as const satisfies readonly CurrencyCode[];

/** This assignment fails if the tuple omits a currency key. `satisfies` above rejects extra keys. */
export const currencyCodes: readonly CurrencyCode[] = currencyCodeList satisfies readonly CurrencyCode[] &
  (Exclude<CurrencyCode, (typeof currencyCodeList)[number]> extends never ? unknown : never);

/** A stored amount is an integer number of milliunits: thousandths of the major unit. */
export const milliunitDigits = 3;

/** The number of minor-unit digits of the currency (ISO 4217). */
export function currencyDigits(code: string): number | undefined {
  const known = currencyCodeList.find((item) => item === code);
  return known === undefined ? undefined : currencyMinorUnits[known];
}

/** The number of minor-unit digits of a known currency. An unknown code is an error. */
export function requireCurrencyDigits(code: string) {
  const digits = currencyDigits(code);
  if (digits === undefined) {
    throw new Error("Unknown currency");
  }
  return digits;
}

/** The milliunits in one minor unit of the currency. CAD: 10. JPY: 1000. KWD: 1. */
export function currencyStep(code: string): number {
  return 10 ** (milliunitDigits - requireCurrencyDigits(code));
}

/** True when the currency can have the amount: the amount is a whole number of minor units. */
export function isWholeAmount(amount: number, step: number): boolean {
  return Number.isSafeInteger(amount) && amount % step === 0;
}

function inSteps(units: number, step: number) {
  return units === 0 ? 0 : units * step;
}

/** Rounds a calculated amount to a whole number of minor units. A half goes away from zero. */
export function roundToStep(value: number, step: number): number {
  const units = Math.round(Math.abs(value) / step);
  return inSteps(value < 0 ? -units : units, step);
}

/** Rounds a calculated amount down (toward negative infinity) to a whole number of minor units. */
export function floorToStep(value: number, step: number): number {
  return inSteps(Math.floor(value / step), step);
}

type StepRounding = "half" | "up" | "down";

/**
 * Divides an integer amount by a positive integer with integer math. The result is a whole number of minor units.
 * "half" goes away from zero at a half. "up" goes toward positive infinity. "down" goes toward negative infinity.
 */
export function divideAmount(total: number, divisor: number, step: number, rounding: StepRounding = "half"): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(divisor) || divisor < 1) {
    throw new Error("Division needs a safe integer amount and a positive integer divisor");
  }
  const unit = divisor * step;
  const negative = total < 0;
  const magnitude = Math.abs(total);
  const remainder = magnitude % unit;
  let units = (magnitude - remainder) / unit;
  if (rounding === "half" ? remainder * 2 >= unit : remainder > 0 && (rounding === "up") !== negative) {
    units += 1;
  }
  return inSteps(negative ? -units : units, step);
}

const decimalAmount = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Reads a typed decimal amount of the currency as milliunits. More decimal places than the currency has is an error. */
export function parseAmount(code: string, text: string): number {
  const digits = requireCurrencyDigits(code);
  const match = decimalAmount.exec(text.trim());
  if (!match) {
    throw new Error("Amount is not a decimal number");
  }

  const fraction = match[3] ?? "";
  if (fraction.length > digits) {
    throw new Error("Amount has too many decimal places");
  }

  const amount = scaleMilliunits(match[2] ?? "0", fraction, match[1] === "-");
  if (amount === null) {
    throw new Error("Amount is too large");
  }
  return amount;
}

/** Scale validated decimal parts without floating-point arithmetic. Null means the amount is too large. */
export function scaleMilliunits(whole: string, fraction: string, negative: boolean): number | null {
  const scaled = BigInt(`${whole}${fraction.padEnd(milliunitDigits, "0")}`);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  const amount = Number(scaled);
  return amount === 0 ? 0 : negative ? -amount : amount;
}

/** The exact decimal text of an amount in milliunits, with no zeros at the end of the fraction. 12340 is "12.34". */
export function amountText(amount: number): string {
  const negative = amount < 0;
  const text = Math.abs(amount).toString().padStart(milliunitDigits + 1, "0");
  const whole = text.slice(0, -milliunitDigits);
  const fraction = text.slice(-milliunitDigits).replace(/0+$/, "");
  const body = fraction.length === 0 ? whole : `${whole}.${fraction}`;
  return `${negative ? "-" : ""}${body}`;
}

export const currencyCodeSchema = z.enum(currencyCodeList);
