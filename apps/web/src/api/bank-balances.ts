import type { BankBalanceInput } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { bankBalanceError } from "@/accounts/format";
import { api, formWrite, unwrap } from "@/api/client";

/** The latest bank balance of each active account that has one, against the calculated balance on its date. */
export function bankStatusesQuery() {
  return queryOptions({
    queryKey: ["bank-balances", "status"],
    queryFn: () => unwrap(api["bank-balances"].status.$get()),
  });
}

/** The bank balances of an account and its status. */
export function bankBalanceListQuery(accountId: string) {
  return queryOptions({
    queryKey: ["bank-balances", accountId],
    queryFn: () => unwrap(api.accounts[":id"]["bank-balances"].$get({ param: { id: accountId } })),
  });
}

/** Add a bank balance (`id` is null) or change one. */
export function useSaveBankBalance() {
  return useMutation({
    meta: formWrite,
    mutationFn: ({ accountId, id, body }: { accountId: string; id: string | null; body: BankBalanceInput }) =>
      unwrap(
        id
          ? api.accounts[":id"]["bank-balances"][":balanceId"].$put({ param: { id: accountId, balanceId: id }, json: body })
          : api.accounts[":id"]["bank-balances"].$post({ param: { id: accountId }, json: body }),
      ),
  });
}

export function useDeleteBankBalance() {
  return useMutation({
    meta: { errorText: bankBalanceError },
    mutationFn: ({ accountId, id }: { accountId: string; id: string }) =>
      unwrap(api.accounts[":id"]["bank-balances"][":balanceId"].$delete({ param: { id: accountId, balanceId: id } })),
  });
}
