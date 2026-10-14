import { useSuspenseQueries } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";

/** The account that the import editor opened for. The result is null when the editor opened for no account. */
export function useImportAccount(accountId: string | null) {
  const ids = accountId === null ? [] : [accountId];
  return useSuspenseQueries({ queries: ids.map((id) => accountQuery(id)) }).at(0)?.data ?? null;
}
