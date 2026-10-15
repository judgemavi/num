import { currencyCodes } from "@num/shared";
import { useMemo } from "react";

function currencyLabel(code: string, names: Intl.DisplayNames | null) {
  const name = names?.of(code);
  if (!name || name.toUpperCase() === code) {
    return code;
  }
  return `${name} (${code})`;
}

/** The currencies as Combobox options: the name in the language of the browser and the code. */
export function useCurrencyOptions() {
  return useMemo(() => {
    const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(undefined, { type: "currency" }) : null;
    return currencyCodes.map((code) => ({ id: code, label: currencyLabel(code, names) }));
  }, []);
}
