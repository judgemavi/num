import { queryOptions, skipToken } from "@tanstack/react-query";
import { api, errorCode, unwrap } from "@/api/client";

/** Give null when the account has no mortgage terms. Throw each other error again. */
async function orNoTerms<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof Error && errorCode(error) === "mortgage_terms_not_found") {
      return null;
    }
    throw error;
  }
}

/** The saved terms of a mortgage account, or null when the account has none. */
export function mortgageTermsQuery(accountId: string) {
  return queryOptions({
    queryKey: ["mortgage-terms", accountId],
    queryFn: () => orNoTerms(unwrap(api.accounts[":id"]["mortgage-terms"].$get({ param: { id: accountId } }))),
  });
}

type MortgageExtra = { extra: number; lumpSum: number; lumpDate: string };

/** The mortgage schedule of an account, or null when the account has no terms. An extra amount shows its effect. */
export function mortgageViewQuery(accountId: string, asOf: string, { extra, lumpSum, lumpDate }: MortgageExtra) {
  const lump = lumpSum > 0 && lumpDate.length > 0;
  return queryOptions({
    queryKey: ["mortgage-view", accountId, asOf, extra, lumpSum, lumpDate],
    queryFn: () =>
      orNoTerms(
        unwrap(
          api.accounts[":id"].mortgage.$get({
            param: { id: accountId },
            query: { asOf, extra: extra > 0 ? extra : undefined, lumpSum: lump ? lumpSum : undefined, lumpDate: lump ? lumpDate : undefined },
          }),
        ),
      ),
  });
}

type PrefillSearch = { fromAccountId: string; toAccountId: string | null; date: string };

/**
 * The principal and the interest of a mortgage payment on a date, or null when the accounts have no mortgage payment.
 * The read does not start until `wanted` is true.
 */
export function mortgagePrefillQuery({ fromAccountId, toAccountId, date }: PrefillSearch, wanted: boolean) {
  return queryOptions({
    queryKey: ["mortgage-prefill", fromAccountId, toAccountId, date],
    queryFn: wanted ? () => unwrap(api["mortgage-prefill"].$get({ query: { fromAccountId, toAccountId: toAccountId ?? undefined, date } })) : skipToken,
  });
}
