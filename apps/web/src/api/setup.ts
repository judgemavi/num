import type { CategorySet, CurrencyCode } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, errorCode, formWrite, unwrap } from "@/api/client";
import { localAsOf } from "@/as-of";

export function setupStatusQuery() {
  return queryOptions({
    queryKey: ["setup"],
    queryFn: () => unwrap(api.setup.$get()),
  });
}

export function useCompleteSetup() {
  return useMutation({
    meta: formWrite,
    mutationFn: async (body: { currency: CurrencyCode; categorySet: CategorySet }) => {
      try {
        await unwrap(api.setup.$post({ query: { asOf: localAsOf() }, json: body }));
      } catch (error) {
        if (errorCode(error) !== "setup_already_complete") throw error;
      }
    },
  });
}
