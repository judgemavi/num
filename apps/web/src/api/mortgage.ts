import { queryOptions } from "@tanstack/react-query";
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

/** The mortgage of an account, or null when the account has no terms. An extra amount shows its effect. */
export function mortgageViewQuery(accountId: string, asOf: string, { extra, lumpSum, lumpDate }: MortgageExtra) {
  const lump = lumpSum > 0 && lumpDate.length > 0;
  const request = { asOf, extra: extra > 0 ? extra : undefined, lumpSum: lump ? lumpSum : undefined, lumpDate: lump ? lumpDate : undefined };
  return queryOptions({
    queryKey: ["mortgage-view", accountId, request],
    queryFn: () =>
      orNoTerms(
        unwrap(
          api.accounts[":id"].mortgage.$get({
            param: { id: accountId },
            query: request,
          }),
        ),
      ),
  });
}

/**
 * The rows of the payment schedule of a mortgage in one calendar year, with the actual payments, or null when the
 * account has no terms. The server moves a year outside the schedule to the nearest year.
 */
export function mortgageScheduleQuery(accountId: string, asOf: string, year: number) {
  return queryOptions({
    queryKey: ["mortgage-schedule", accountId, { asOf, year }],
    queryFn: () => orNoTerms(unwrap(api.accounts[":id"].mortgage.schedule.$get({ param: { id: accountId }, query: { asOf, year } }))),
  });
}

/**
 * The start values of a loan payment to a mortgage or loan account on a date: the interest from the
 * payment schedule and the interest category. Each one is null when there is none.
 */
export function loanPaymentDefaultsQuery(accountId: string, date: string) {
  return queryOptions({
    queryKey: ["loan-payment-defaults", accountId, date],
    queryFn: () => unwrap(api["loan-payment-defaults"].$get({ query: { accountId, date } })),
  });
}
