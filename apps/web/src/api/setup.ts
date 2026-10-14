import type { CategorySet, CurrencyCode } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, formWrite, unwrap } from "@/api/client";

export function setupStatusQuery() {
  return queryOptions({
    queryKey: ["setup"],
    queryFn: () => unwrap(api.setup.$get()),
  });
}

export function useCompleteSetup() {
  return useMutation({
    meta: formWrite,
    mutationFn: (body: { currency: CurrencyCode; categorySet: CategorySet }) => unwrap(api.setup.$post({ json: body })),
  });
}
