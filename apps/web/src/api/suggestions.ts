import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

type Draft = { accountId: string; payee: string; date: string; amount: number | null };

/** The suggested category, transfer account and merchant for a transaction that is not saved. */
export function suggestionQuery({ accountId, payee, date, amount }: Draft) {
  return queryOptions({
    queryKey: ["suggestion", accountId, payee, amount, date],
    enabled: accountId.length > 0 && payee.trim().length > 0 && amount !== null,
    queryFn: () => unwrap(api.suggestions.$get({ query: { accountId, payee, amount, date: isoDate.test(date) ? date : undefined } })),
  });
}

/** The account that has the opposite side of a possible transfer. */
export function transferHintQuery({ accountId, date, amount }: Omit<Draft, "payee">) {
  return queryOptions({
    queryKey: ["transfer-hint", accountId, date, amount],
    enabled: accountId.length > 0 && isoDate.test(date) && amount !== null && amount !== 0,
    queryFn: () => unwrap(api["transfer-hint"].$get({ query: { accountId, date, amount } })),
  });
}
