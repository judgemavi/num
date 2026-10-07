import { z } from "zod";

export const maxInterestMilliPct = 1_000_000;

export const interestRateMilliPctSchema = z.number().int().min(0).max(maxInterestMilliPct);

const percentText = /^(\d+)(?:\.(\d+))?$/;

export function percentToMilliPct(text: string): number {
  const match = percentText.exec(text.trim());
  if (!match) {
    throw new Error("Interest rate is not a percent");
  }
  const fraction = match[2] ?? "";
  if (fraction.length > 3) {
    throw new Error("Interest rate has too many decimal places");
  }
  const milli = Number(`${match[1]}${fraction.padEnd(3, "0")}`);
  if (!Number.isSafeInteger(milli) || milli > maxInterestMilliPct) {
    throw new Error("Interest rate is too high");
  }
  return milli;
}

export function milliPctToPercent(milliPct: number): string {
  if (!Number.isSafeInteger(milliPct) || milliPct < 0 || milliPct > maxInterestMilliPct) {
    throw new Error("Interest rate is not a valid MilliPct");
  }
  const whole = Math.floor(milliPct / 1000);
  const fraction = String(milliPct % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  if (fraction.length === 0) {
    return String(whole);
  }
  return `${whole}.${fraction}`;
}
