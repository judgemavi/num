import type { InboxDecisionCode } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap } from "@/api/client";
import { localAsOf } from "@/as-of";
import { undoToast } from "@/components/undo-toast";
import { inboxError } from "@/review/format";
import { countText } from "@/transactions/format";

export function reviewSummaryQuery(asOf: string) {
  return queryOptions({
    queryKey: ["review", asOf],
    queryFn: async () => {
      const page = await unwrap(api.transactions.review.$get({ query: { asOf, pageSize: 1 } }));
      return { total: page.total, counts: page.reviewCounts };
    },
  });
}

/** The saved answers to Needs review items. */
export function inboxDecisionsQuery() {
  return queryOptions({
    queryKey: ["inbox-decisions"],
    queryFn: async () => (await unwrap(api.review.decisions.$get())).items,
  });
}

function decideItem({ asOf, itemKey, decision }: { asOf: string; itemKey: string; decision: InboxDecisionCode }) {
  return unwrap(api.review.decisions.$post({ query: { asOf }, json: { itemKey, decision } }));
}

/** Record the answer to a Needs review item. */
export function useDecideItem() {
  const undo = useUndoDecision();
  return useMutation({
    meta: { errorText: inboxError },
    mutationFn: decideItem,
    onSuccess: (_decision, { itemKey }) => undoToast("Answer saved.", () => undo.mutate(itemKey)),
  });
}

export function useUndoDecision() {
  return useMutation({
    meta: { errorText: inboxError },
    mutationFn: (itemKey: string) => unwrap(api.review.decisions.undo.$post({ json: { itemKey } })),
  });
}

/**
 * Approve the selected rows: apply the automatic label or the suggestion of each row as a confirmation.
 * The server skips a row with a question or with no suggestion. No route undoes an approval, thus the toast has no "Undo".
 */
export function useApproveSelected() {
  return useMutation({
    meta: { errorText: inboxError },
    mutationFn: (transactionIds: string[]) =>
      unwrap(api.transactions.approve.$post({ query: { asOf: localAsOf() }, json: { transactionIds } })),
    onSuccess: (result) => toast.success(countText(result.approved, "approved", result.skipped.length)),
  });
}
