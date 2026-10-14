import type { approveLevels, InboxDecisionCode, TransactionFilter } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorCode, unwrap } from "@/api/client";
import { undoToast } from "@/components/undo-toast";
import { inboxError } from "@/review/format";

export function reviewSummaryQuery(asOf: string) {
  return queryOptions({
    queryKey: ["needs-review", asOf],
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

export type ApproveLevel = (typeof approveLevels)[number];

type ApproveInput = { asOf: string; filter: TransactionFilter; level: ApproveLevel; count: number };

/**
 * Confirm all Needs review rows of one level that match the filters. `count` is the number that the person saw.
 * When the number is different on the server, no row changes. The result then has `changed: true` and `left`,
 * the number of rows at that level now. All queries are invalidated, thus the screen shows the new list.
 */
export function useApproveLevel() {
  return useMutation({
    meta: { errorText: inboxError },
    mutationFn: async ({ asOf, filter, level, count }: ApproveInput) => {
      try {
        await unwrap(api.transactions.approve.$post({ query: { asOf }, json: { ...filter, level, count } }));
        return { changed: false as const, level };
      } catch (error) {
        if (!(error instanceof Error) || errorCode(error) !== "review_changed") {
          throw error;
        }
        const left = await unwrap(api.transactions.review.$get({ query: { ...filter, asOf, page: 1, pageSize: 1 } })).then(
          (fresh) => fresh.reviewCounts[level],
          () => 0,
        );
        return { changed: true as const, level, left };
      }
    },
    // No route undoes an approval, thus the toast has no "Undo".
    onSuccess: (result, { count }) => {
      if (!result.changed) {
        toast.success(count === 1 ? "1 transaction approved." : `${count} transactions approved.`);
      }
    },
  });
}
