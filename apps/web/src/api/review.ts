import type { InboxDecisionCode, InboxGroupApply, TransactionFilter } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, errorCode, unwrap } from "@/api/client";

export function reviewSummaryQuery(asOf: string) {
  return queryOptions({
    queryKey: ["needs-review", asOf],
    queryFn: async () => {
      const page = await unwrap(api.transactions.$get({ query: { needsReview: true, asOf, pageSize: 1 } }));
      return { total: page.total, counts: page.reviewCounts };
    },
  });
}

/** The saved answers to Needs review items. The query waits until `enabled` is true. */
export function inboxDecisionsQuery(enabled = true) {
  return queryOptions({
    queryKey: ["inbox-decisions"],
    enabled,
    queryFn: async () => (await unwrap(api.review.decisions.$get())).items,
  });
}

/** Record the answer to a Needs review item. */
export function useDecideItem() {
  return useMutation({
    mutationFn: ({ asOf, itemKey, decision }: { asOf: string; itemKey: string; decision: InboxDecisionCode }) =>
      unwrap(api.review.decisions.$post({ query: { asOf }, json: { itemKey, decision } })),
  });
}

export function useUndoDecision() {
  return useMutation({
    mutationFn: (itemKey: string) => unwrap(api.review.decisions.undo.$post({ json: { itemKey } })),
  });
}

/** Accept two transactions as the two sides of one transfer. */
export function useAcceptPair() {
  return useMutation({
    mutationFn: ({ asOf, leftId, rightId }: { asOf: string; leftId: string; rightId: string }) =>
      unwrap(api["transfer-pairs"].$post({ query: { asOf }, json: { leftId, rightId } })),
  });
}

/** Give one answer to a group of transactions of one account. */
export function useApplyGroup() {
  return useMutation({
    mutationFn: (body: InboxGroupApply) => unwrap(api.transactions.group.$post({ json: body })),
  });
}

export type ApproveLevel = "sure" | "likely";

type ApproveInput = { asOf: string; filter: TransactionFilter; level: ApproveLevel; count: number };

/**
 * Confirm all Needs review rows of one level that match the filters. `count` is the number that the person saw.
 * When the number is different on the server, no row changes. The result then has `changed: true` and `left`,
 * the number of rows at that level now. All queries are invalidated, thus the screen shows the new list.
 */
export function useApproveLevel() {
  return useMutation({
    mutationFn: async ({ asOf, filter, level, count }: ApproveInput) => {
      try {
        await unwrap(api.transactions.approve.$post({ query: { asOf }, json: { ...filter, level, count } }));
        return { changed: false as const, level };
      } catch (error) {
        if (!(error instanceof Error) || errorCode(error) !== "review_changed") {
          throw error;
        }
        const left = await unwrap(api.transactions.$get({ query: { ...filter, needsReview: true, asOf, page: 1, pageSize: 1 } })).then(
          (fresh) => fresh.reviewCounts?.[level] ?? 0,
          () => 0,
        );
        return { changed: true as const, level, left };
      }
    },
  });
}
