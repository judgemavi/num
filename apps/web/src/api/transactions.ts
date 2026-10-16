import type { BulkEdit, Transaction, TransactionCreate, TransactionListQuery, TransactionReviewListQuery, TransactionUpdate } from "@num/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formWrite, unwrap } from "@/api/client";
import { fullPage } from "@/api/pages";
import { localAsOf } from "@/as-of";
import { countText, transactionError } from "@/transactions/format";

/** One page of the transaction list. Each row that needs review on `asOf` has its review. */
export function transactionListQuery(search: TransactionListQuery, asOf: string) {
  return queryOptions({
    queryKey: ["transactions", "all", search, asOf],
    queryFn: () => unwrap(api.transactions.$get({ query: { ...search, asOf } })),
  });
}

/**
 * One page of the rows that need review, and the counts of their levels on all pages. The page also
 * sorts by confidence.
 */
export function transactionReviewListQuery(search: TransactionReviewListQuery, asOf: string) {
  return queryOptions({
    queryKey: ["transactions", "review", search, asOf],
    queryFn: () => unwrap(api.transactions.review.$get({ query: { ...search, asOf } })),
  });
}

/** The review of one transaction: the question and the proposed answer that the editor shows. Null when it needs none. */
export function transactionReviewQuery(id: string, asOf: string) {
  return queryOptions({
    queryKey: ["transaction", id, "review", asOf],
    queryFn: async () => (await unwrap(api.transactions[":id"].review.$get({ param: { id }, query: { asOf } }))).review,
  });
}

/** The transactions of an account that an occurrence can link to. */
export function linkCandidatesQuery(accountId: string) {
  return queryOptions({
    queryKey: ["transactions", "link-candidates", accountId],
    queryFn: async () => (await unwrap(api.transactions.$get({ query: { accountId, pageSize: fullPage } }))).items,
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
  const request = { asOf, payee: payee.trim().length > 0 ? payee : undefined };
  return queryOptions({
    queryKey: ["refund-purchases", request],
    queryFn: async () =>
      (await unwrap(api.transactions["refund-purchases"].$get({ query: request }))).items,
  });
}

/** Confirm the automatic label of a transaction. */
function looksRight(id: string) {
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

/**
 * The bulk edit of the selected rows. A field that is not in the body does not change. The server
 * skips a row that cannot take the change. The toast shows the count of changed and skipped rows.
 */
export function useBulkEdit() {
  return useMutation({
    meta: formWrite,
    mutationFn: (body: BulkEdit) => unwrap(api.transactions.bulk.$post({ query: { asOf: localAsOf() }, json: body })),
    onSuccess: (result) => toast.success(countText(result.changed, "changed", result.skipped.length)),
  });
}
