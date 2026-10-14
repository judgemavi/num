import type { approveLevels, InboxDecisionCode, InboxGroupApply, Suggestion, TransactionFilter } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorCode, unwrap } from "@/api/client";
import { linkOccurrence, savePlan } from "@/api/recurring";
import { linkRefund, looksRight } from "@/api/transactions";
import { undoToast } from "@/components/undo-toast";
import { inboxError } from "@/review/format";

export function reviewSummaryQuery(asOf: string) {
  return queryOptions({
    queryKey: ["needs-review", asOf],
    queryFn: async () => {
      const page = await unwrap(api.transactions.$get({ query: { needsReview: true, asOf, pageSize: 1 } }));
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

function applyGroup(body: InboxGroupApply) {
  return unwrap(api.transactions.group.$post({ json: body }));
}

/** Give one answer to a group of transactions of one account. */
export function useApplyGroup() {
  return useMutation({ meta: { errorText: inboxError }, mutationFn: applyGroup });
}

/**
 * A one-click answer to a row of the Transactions table.
 * - `looksRight`: confirm the automatic label.
 * - `acceptPair`: the two transactions are the two sides of one transfer.
 * - `decide`: record the answer to a question.
 * - `linkRefund`: the transaction is a refund of the purchase.
 * - `planAmount`: the plan gets the new expected amount. The other fields stay the same.
 * - `linkOccurrence`: the transaction is the payment of the occurrence.
 * - `applySuggestion`: give the transaction the suggested category, transfer or mortgage payment.
 */
export type ReviewAnswer =
  | { kind: "looksRight"; id: string }
  | { kind: "acceptPair"; asOf: string; leftId: string; rightId: string }
  | { kind: "decide"; asOf: string; itemKey: string; decision: InboxDecisionCode }
  | { kind: "linkRefund"; refundId: string; purchaseId: string }
  | { kind: "planAmount"; planId: string; expectedAmount: number }
  | { kind: "linkOccurrence"; planId: string; dueDate: string; transactionId: string }
  | { kind: "applySuggestion"; accountId: string; transactionId: string; suggestion: Suggestion };

function answerReview(answer: ReviewAnswer) {
  switch (answer.kind) {
    case "looksRight":
      return looksRight(answer.id);
    case "acceptPair":
      return unwrap(api["transfer-pairs"].$post({ query: { asOf: answer.asOf }, json: { leftId: answer.leftId, rightId: answer.rightId } }));
    case "decide":
      return decideItem(answer);
    case "linkRefund":
      return linkRefund(answer);
    case "planAmount":
      return savePlan({ id: answer.planId, body: { expectedAmount: answer.expectedAmount } });
    case "linkOccurrence":
      return linkOccurrence(answer);
    case "applySuggestion": {
      const { suggestion } = answer;
      return applyGroup({
        accountId: answer.accountId,
        transactionIds: [answer.transactionId],
        categoryId: suggestion.transferAccountId ? null : suggestion.categoryId,
        transferAccountId: suggestion.transferAccountId,
        merchantId: suggestion.transferAccountId ? null : suggestion.merchantId,
        mortgage: suggestion.mortgage,
      });
    }
  }
}

/** Save a one-click answer. One mutation for all answers gives the row one saving state and one error. */
export function useAnswerReview() {
  const undo = useUndoDecision();
  return useMutation({
    meta: { errorText: inboxError },
    mutationFn: async (answer: ReviewAnswer) => {
      await answerReview(answer);
    },
    // A "no" answer is a decision that can be undone.
    onSuccess: (_result, answer) => {
      if (answer.kind === "decide") {
        undoToast("Answer saved.", () => undo.mutate(answer.itemKey));
      }
    },
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
        const left = await unwrap(api.transactions.$get({ query: { ...filter, needsReview: true, asOf, page: 1, pageSize: 1 } })).then(
          (fresh) => fresh.reviewCounts?.[level] ?? 0,
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
