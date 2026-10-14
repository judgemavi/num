import { amountText, currencyStep, requireCurrencyDigits, roundToStep } from "@num/shared";

function numberFormat(currency: string, digits: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The amount in major units, rounded to the minor unit of the currency with integer math first.
 * A number with no more than 3 decimal places goes back to the same decimal text in Intl.
 */
function shown(currency: string, milli: number) {
  return { value: Number(amountText(roundToStep(milli, currencyStep(currency)))), digits: requireCurrencyDigits(currency) };
}

export function formatMoney(currency: string, milli: number): string {
  const { value, digits } = shown(currency, milli);
  return numberFormat(currency, digits).format(value);
}

export function moneyParts(currency: string, milli: number): { currency: string; integer: string; fraction: string } {
  const { value, digits } = shown(currency, Math.abs(milli));
  const parts = numberFormat(currency, digits).formatToParts(value);
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
