import type { Transaction, TransactionCreate, TransactionListQuery, TransactionUpdate } from "@num/shared";
import { queryOptions, useIsFetching, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formWrite, unwrap } from "@/api/client";
import { transactionError } from "@/transactions/format";

/** True while a page of the transaction list loads, the first time or again. */
export function useTransactionListFetching() {
  return useIsFetching({ queryKey: ["transactions"] }) > 0;
}

/** One page of the transaction list. The Needs review filter uses `asOf`. */
export function transactionListQuery(search: TransactionListQuery, asOf: string) {
  const reviewDate = search.needsReview ? asOf : null;
  return queryOptions({
    queryKey: ["transactions", search, reviewDate],
    queryFn: () => unwrap(api.transactions.$get({ query: { ...search, asOf: reviewDate ?? undefined } })),
  });
}

/** The transactions of an account that an occurrence can link to. */
export function linkCandidatesQuery(accountId: string, dueDate: string) {
  return queryOptions({
    queryKey: ["plan-transactions", accountId, dueDate],
    queryFn: async () => (await unwrap(api.transactions.$get({ query: { accountId, pageSize: 200 } }))).items,
  });
}

export function transactionQuery(id: string) {
  return queryOptions({
    queryKey: ["transaction", id],
    queryFn: () => unwrap(api.transactions[":id"].$get({ param: { id } })),
  });
}

/** The recent purchases that a refund can link to. */
export function refundPurchasesQuery(asOf: string, payee: string) {
  return queryOptions({
    queryKey: ["refund-purchases", asOf, payee],
    queryFn: async () =>
      (await unwrap(api.transactions["refund-purchases"].$get({ query: { asOf, payee: payee.trim().length > 0 ? payee : undefined } }))).items,
  });
}

/** Confirm the automatic label of a transaction. */
export function looksRight(id: string) {
  return unwrap(api.transactions[":id"]["looks-right"].$post({ param: { id } }));
}

/**
 * A save from the Transaction editor.
 * - `confirm`: the person changed nothing on a transaction with an automatic label. The save confirms the label.
 * - `create`: add a transaction.
 * - `update`: change a transaction. When `confirmLabel` is true, the save also confirms an automatic label that stays.
 */
export type TransactionSave =
  | { kind: "confirm"; id: string }
  | { kind: "create"; body: TransactionCreate }
  | { kind: "update"; id: string; body: TransactionUpdate; confirmLabel: boolean };

export function useSaveTransaction() {
  return useMutation({
    meta: formWrite,
    mutationFn: async (save: TransactionSave) => {
      if (save.kind === "confirm") {
        return looksRight(save.id);
      }
      const saved = await unwrap(
        save.kind === "create" ? api.transactions.$post({ json: save.body }) : api.transactions[":id"].$patch({ param: { id: save.id }, json: save.body }),
      );
      if (save.kind === "update" && save.confirmLabel && saved.autoReason !== null) {
        return looksRight(saved.id);
      }
      return saved;
    },
  });
}

/**
 * Delete a transaction. The delete also removes the other side of a transfer that the app made.
 * The reads of the two records leave the cache before the rule in `main.tsx` runs. Thus no read asks for a record
 * that is not in the book.
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorText: transactionError },
    mutationFn: async ({ id, transferPeerId }: Pick<Transaction, "id" | "transferPeerId">) => {
      const deleted = await unwrap(api.transactions[":id"].$delete({ param: { id } }));
      queryClient.removeQueries({ queryKey: transactionQuery(id).queryKey });
      if (transferPeerId) {
        queryClient.removeQueries({ queryKey: transactionQuery(transferPeerId).queryKey });
      }
      return deleted;
    },
  });
}

/** Link a refund to the purchase that it returns. */
export function linkRefund({ refundId, purchaseId }: { refundId: string; purchaseId: string }) {
  return unwrap(api.transactions[":id"]["refund-of"].$post({ param: { id: refundId }, json: { purchaseId } }));
}
