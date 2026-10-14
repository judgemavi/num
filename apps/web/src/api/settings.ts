import type { ConfidenceMode, CurrencyCode } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function bookCurrencyQuery() {
  return queryOptions({
    queryKey: ["book-currency"],
    queryFn: async () => (await unwrap(api.settings.currency.$get())).currency,
  });
}

/** A change of the book currency is a relabel. Amounts do not change (decision 0037). */
export function useSaveBookCurrency() {
  return useMutation({
    mutationFn: (currency: CurrencyCode) => unwrap(api.settings.currency.$patch({ json: { currency } })),
  });
}

export function matchingSettingQuery() {
  return queryOptions({
    queryKey: ["matching-setting"],
    queryFn: () => unwrap(api.settings.matching.$get()),
  });
}

export function useSaveMatchingSetting() {
  return useMutation({
    mutationFn: (autoConfidence: ConfidenceMode) => unwrap(api.settings.matching.$patch({ json: { autoConfidence } })),
  });
}

export function aiAccessQuery() {
  return queryOptions({
    queryKey: ["ai-access"],
    queryFn: () => unwrap(api.settings.ai.$get()),
  });
}

export function useSaveAiAccess() {
  return useMutation({
    mutationFn: (aiCanWrite: boolean) => unwrap(api.settings.ai.$patch({ json: { aiCanWrite } })),
  });
}
