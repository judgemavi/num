import type { CurrencyCode } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, formWrite, unwrap } from "@/api/client";

export function bookCurrencyQuery() {
  return queryOptions({
    queryKey: ["book-currency"],
    queryFn: async () => (await unwrap(api.settings.currency.$get())).currency,
  });
}

/** A change of the book currency is a relabel. Amounts do not change. */
export function useSaveBookCurrency() {
  return useMutation({
    meta: formWrite,
    mutationFn: (currency: CurrencyCode) => unwrap(api.settings.currency.$patch({ json: { currency } })),
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
    meta: { errorText: () => "The AI access setting did not save. Try again." },
    mutationFn: (aiCanWrite: boolean) => unwrap(api.settings.ai.$patch({ json: { aiCanWrite } })),
  });
}
