export const moneyDirections = ["out", "in"] as const;

export type MoneyDirection = (typeof moneyDirections)[number];

export function moneyDirection(amount: number): MoneyDirection {
  return amount < 0 ? "out" : "in";
}

/** The Money out / Money in toggle sets the sign. The typed amount stays positive. */
export function signedAmount(direction: MoneyDirection, positive: number): number {
  if (!Number.isInteger(positive) || positive < 0) {
    throw new Error("Amount must be a positive number of milliunits.");
  }
  if (positive === 0) {
    return 0;
  }
  return direction === "out" ? -positive : positive;
}
