import { queryOptions, skipToken } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

type Draft = { accountId: string; payee: string; date: string; amount: number | null };

/**
 * The suggested category, transfer account and merchant for a transaction that is not saved.
 * The read does not start until the draft has an account, a payee and an amount.
 */
export function suggestionQuery({ accountId, payee, date, amount }: Draft) {
  const request = accountId.length > 0 && payee.trim().length > 0 && amount !== null
    ? { accountId, payee, amount, date: isoDate.test(date) ? date : undefined }
    : null;
  return queryOptions({
    queryKey: ["suggestion", request],
    queryFn: request ? () => unwrap(api.suggestions.$get({ query: request })) : skipToken,
  });
}

/**
 * The account that has the opposite side of a possible transfer.
 * The read does not start until the draft has an account, a date and an amount that is not zero.
 */
export function transferHintQuery({ accountId, date, amount }: Omit<Draft, "payee">) {
  const request = accountId.length > 0 && isoDate.test(date) && amount !== null && amount !== 0
    ? { accountId, date, amount }
    : null;
  return queryOptions({
    queryKey: ["transfer-hint", request],
    queryFn: request ? () => unwrap(api["transfer-hint"].$get({ query: request })) : skipToken,
  });
}
