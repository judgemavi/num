export const moneyDirections = ["out", "in"] as const;

export type MoneyDirection = (typeof moneyDirections)[number];

export function moneyDirection(amount: number): MoneyDirection {
  return amount < 0 ? "out" : "in";
}

/** The Money out / Money in toggle sets the sign. The typed amount stays positive. */
export function signedAmount(direction: MoneyDirection, positiveMinor: number): number {
  if (!Number.isInteger(positiveMinor) || positiveMinor < 0) {
    throw new Error("Amount must be a positive number of minor units.");
  }
  if (positiveMinor === 0) {
    return 0;
  }
  return direction === "out" ? -positiveMinor : positiveMinor;
}
