import {
  approveLevelResultSchema,
  transactionListSchema,
  type Plan,
  type TransactionListQuery,
} from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { useEditors } from "@/editors/editor-api";
import { useActivePlans } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { inboxError } from "@/review/format";
import { filterBody, transactionPath } from "@/transactions/query";

export type ReviewActions = {
  pending: boolean;
  error: string | null;
  planById: Map<string, Plan>;
  run: (action: () => Promise<{ ok: boolean }>) => Promise<void>;
  approve: (level: "sure" | "likely", count: number) => Promise<void>;
};

/** One-click answers and bulk approval for the Transactions table. */
export function useReviewActions(search: TransactionListQuery): ReviewActions {
  const queryClient = useQueryClient();
  const { confirm } = useEditors();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const plans = useActivePlans();
  const planById = new Map((plans.data?.items ?? []).map((plan) => [plan.id, plan]));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
    await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
  }

  async function run(action: () => Promise<{ ok: boolean }>) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError("That answer did not save.");
      return;
    }
    setError(null);
    await refresh();
  }

  async function approve(level: "sure" | "likely", count: number) {
    if (count === 0) {
      return;
    }
    const asOf = localAsOf();
    const name = level === "sure" ? "Sure" : "Likely";
    const ok = await confirm({
      title: `Approve all ${count} ${name}?`,
      description: `This confirms ${count} ${count === 1 ? "transaction" : "transactions"} on every page that match your filters. Each one counts as your answer.`,
      confirmLabel: `Approve all ${count} ${name}`,
    });
    if (!ok) {
      return;
    }
    setPending(true);
    const result = await apiRequest(`/api/transactions/approve?asOf=${asOf}`, approveLevelResultSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...filterBody(search), level, count }),
    });
    setPending(false);
    if (!result.ok) {
      setError(inboxError(result.code));
      if (result.code === "review_changed") {
        await refresh();
        const fresh = await apiRequest(transactionPath({ ...search, page: 1, pageSize: 1, needsReview: true }, asOf), transactionListSchema);
        const left = fresh.ok ? (fresh.data.reviewCounts?.[level] ?? 0) : 0;
        if (left === 0) {
          setError(`Nothing is left to approve in ${name}.`);
        } else {
          setError(null);
          await approve(level, left);
        }
      }
      return;
    }
    setError(null);
    await refresh();
  }

  return { pending, error, planById, run, approve };
}
