import type { InboxDecisionCode, Plan, PlanCreate, Suggestion, TransactionListQuery } from "@num/shared";
import { errorCode } from "@/api/client";
import { useLinkOccurrence, useSavePlan } from "@/api/recurring";
import { useAcceptPair, useApplyGroup, useApproveLevel, useDecideItem, type ApproveLevel } from "@/api/review";
import { useLinkRefund, useLooksRight } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { useActivePlans } from "@/editors/lookups";
import { inboxError } from "@/review/format";
import { levelLabel } from "@/transactions/format";
import { filterBody } from "@/transactions/query";

export type ReviewActions = {
  pending: boolean;
  error: string | null;
  planById: Map<string, Plan>;
  looksRight: (id: string) => void;
  acceptPair: (leftId: string, rightId: string) => void;
  decide: (itemKey: string, decision: InboxDecisionCode) => void;
  linkRefund: (refundId: string, purchaseId: string) => void;
  updatePlanAmount: (plan: Plan, expectedAmount: number) => void;
  linkOccurrence: (planId: string, dueDate: string, transactionId: string) => void;
  applySuggestion: (accountId: string, transactionId: string, suggestion: Suggestion) => void;
  approve: (level: ApproveLevel, count: number) => Promise<void>;
};

/** The plan with a new expected amount. The other fields stay the same. */
function planWithAmount(plan: Plan, expectedAmount: number): PlanCreate {
  return {
    name: plan.name,
    kind: plan.kind,
    accountId: plan.accountId,
    expectedAmount,
    tolerance: plan.tolerance,
    amountMode: plan.amountMode,
    categoryId: plan.categoryId,
    transferAccountId: plan.transferAccountId,
    merchantId: plan.merchantId,
    startDate: plan.startDate,
    freq: plan.freq,
    interval: plan.interval,
    monthDay: plan.monthDay,
    businessDayShift: plan.businessDayShift,
    endDate: plan.endDate,
    active: plan.active,
    fundsBuckets: plan.fundsBuckets,
  };
}

/** One-click answers and bulk approval for the Transactions table. */
export function useReviewActions(search: TransactionListQuery): ReviewActions {
  const { confirm } = useEditors();
  const plans = useActivePlans();
  const planById = new Map((plans.data?.items ?? []).map((plan) => [plan.id, plan]));
  const looksRight = useLooksRight();
  const acceptPair = useAcceptPair();
  const decide = useDecideItem();
  const linkRefund = useLinkRefund();
  const savePlan = useSavePlan();
  const linkOccurrence = useLinkOccurrence();
  const applyGroup = useApplyGroup();
  const approveLevel = useApproveLevel();
  const answers = [looksRight, acceptPair, decide, linkRefund, savePlan, linkOccurrence, applyGroup];

  /** Remove the result of each earlier action. Only the newest action shows an error. */
  function start() {
    for (const answer of answers) {
      answer.reset();
    }
    approveLevel.reset();
  }

  function errorText(): string | null {
    if (answers.some((answer) => answer.isError)) {
      return "That answer did not save.";
    }
    if (approveLevel.error) {
      return inboxError(errorCode(approveLevel.error));
    }
    if (approveLevel.data?.changed && approveLevel.data.left === 0) {
      return `Nothing is left to approve in ${levelLabel(approveLevel.data.level)}.`;
    }
    return null;
  }

  async function approve(level: ApproveLevel, count: number) {
    if (count === 0) {
      return;
    }
    const name = levelLabel(level);
    const ok = await confirm({
      title: `Approve all ${count} ${name}?`,
      description: `This confirms ${count} ${count === 1 ? "transaction" : "transactions"} on every page that match your filters. Each one counts as your answer.`,
      confirmLabel: `Approve all ${count} ${name}`,
    });
    if (!ok) {
      return;
    }
    start();
    approveLevel.mutate(
      { asOf: localAsOf(), filter: filterBody(search), level, count },
      {
        onSuccess: (result) => {
          if (result.changed && result.left > 0) {
            void approve(level, result.left);
          }
        },
      },
    );
  }

  return {
    pending: approveLevel.isPending || answers.some((answer) => answer.isPending),
    error: errorText(),
    planById,
    looksRight: (id) => {
      start();
      looksRight.mutate(id);
    },
    acceptPair: (leftId, rightId) => {
      start();
      acceptPair.mutate({ asOf: localAsOf(), leftId, rightId });
    },
    decide: (itemKey, decision) => {
      start();
      decide.mutate({ asOf: localAsOf(), itemKey, decision });
    },
    linkRefund: (refundId, purchaseId) => {
      start();
      linkRefund.mutate({ refundId, purchaseId });
    },
    updatePlanAmount: (plan, expectedAmount) => {
      start();
      savePlan.mutate({ id: plan.id, body: planWithAmount(plan, expectedAmount) });
    },
    linkOccurrence: (planId, dueDate, transactionId) => {
      start();
      linkOccurrence.mutate({ planId, dueDate, transactionId });
    },
    applySuggestion: (accountId, transactionId, suggestion) => {
      start();
      applyGroup.mutate({
        accountId,
        transactionIds: [transactionId],
        excludedIds: [],
        categoryId: suggestion.transferAccountId ? null : suggestion.categoryId,
        transferAccountId: suggestion.transferAccountId,
        merchantId: suggestion.transferAccountId ? null : suggestion.merchantId,
        mortgage: suggestion.mortgage,
      });
    },
    approve,
  };
}
