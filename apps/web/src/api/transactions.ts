import type { TransactionCreate, TransactionListQuery, TransactionUpdate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

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

/** One transaction. The query waits until it has an id and `enabled` is true. */
export function transactionQuery(id: string | null, enabled = true) {
  return queryOptions({
    queryKey: ["transaction", id],
    enabled: id !== null && enabled,
    queryFn: () => unwrap(api.transactions[":id"].$get({ param: { id: id ?? "" } })),
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

function looksRight(id: string) {
  return unwrap(api.transactions[":id"]["looks-right"].$post({ param: { id } }));
}

/** Confirm the automatic label of a transaction. */
export function useLooksRight() {
  return useMutation({ mutationFn: looksRight });
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
    mutationFn: async (save: TransactionSave) => {
      if (save.kind === "confirm") {
        const confirmed = await looksRight(save.id);
        return { id: confirmed.id, skipped: 0, applied: 0 };
      }
      const saved = await unwrap(
        save.kind === "create" ? api.transactions.$post({ json: save.body }) : api.transactions[":id"].$patch({ param: { id: save.id }, json: save.body }),
      );
      if (save.kind === "update" && save.confirmLabel && saved.autoReason !== null) {
        await looksRight(saved.id);
      }
      return { id: saved.id, skipped: saved.skipped?.length ?? 0, applied: saved.applied ?? 0 };
    },
  });
}

export function useDeleteTransaction() {
  return useMutation({
    mutationFn: (id: string) => unwrap(api.transactions[":id"].$delete({ param: { id } })),
  });
}

/** Link a refund to the purchase that it returns. */
export function useLinkRefund() {
  return useMutation({
    mutationFn: ({ refundId, purchaseId }: { refundId: string; purchaseId: string }) =>
      unwrap(api.transactions[":id"]["refund-of"].$post({ param: { id: refundId }, json: { purchaseId } })),
  });
}
