import {
  approveLevelResultSchema,
  transactionListSchema,
  transactionSchema,
  type Plan,
  type ReviewLevel,
  type TransactionListItem,
  type TransactionListQuery,
} from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { inboxError } from "@/review/format";
import { acceptPair, applyInboxGroup, decideItem, linkOccurrence, updatePlanAmount } from "@/review/actions";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { useActivePlans } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { formatDate, levelLabel, plainReason } from "@/transactions/format";
import { filterBody, transactionPath } from "@/transactions/query";

const groups: ReviewLevel[] = ["sure", "likely", "maybe", "none"];

type NeedsReviewListProps = {
  currency: string;
  search: TransactionListQuery;
  items: TransactionListItem[];
  counts: { sure: number; likely: number; maybe: number; none: number };
};

export function NeedsReviewList({ currency, search, items, counts }: NeedsReviewListProps) {
  const asOf = localAsOf();
  const queryClient = useQueryClient();
  const { openEditor, confirm } = useEditors();
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

  async function approve(level: "sure" | "likely", count = counts[level]) {
    if (count === 0) {
      return;
    }
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
        if (fresh.ok && fresh.data.reviewCounts) {
          await approve(level, fresh.data.reviewCounts[level]);
        }
      }
      return;
    }
    setError(null);
    await refresh();
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground">Nothing needs review.</p>;
  }

  return (
    <div className="grid gap-5">
      {error ? <p role="alert">{error}</p> : null}
      {groups.map((level) => {
        const rows = items.filter((item) => (item.review?.level ?? "none") === level);
        if (rows.length === 0) {
          return null;
        }
        const title = levelLabel(level);
        return (
          <ListCard
            key={level}
            label={title}
            title={`${title} · ${counts[level]}`}
            actions={
              level === "sure" || level === "likely" ? (
                <Button type="button" disabled={pending || counts[level] === 0} onClick={() => void approve(level)}>
                  {level === "sure" ? `Approve all ${counts[level]} Sure` : `Approve all ${counts[level]} Likely`}
                </Button>
              ) : null
            }
          >
            {rows.map((row) => (
              <ReviewRow
                key={row.id}
                row={row}
                currency={currency}
                pending={pending}
                planById={planById}
                onOpen={() => void openEditor("transaction", { id: row.id })}
                onRun={run}
                asOf={asOf}
              />
            ))}
          </ListCard>
        );
      })}
    </div>
  );
}

function ReviewRow({
  row,
  currency,
  pending,
  planById,
  onOpen,
  onRun,
  asOf,
}: {
  row: TransactionListItem;
  currency: string;
  pending: boolean;
  planById: Map<string, Plan>;
  onOpen: () => void;
  onRun: (action: () => Promise<{ ok: boolean }>) => Promise<void>;
  asOf: string;
}) {
  const review = row.review;
  const suggestionReason = review?.suggestion?.reason;
  const reason = plainReason({
    reason: review?.reason ?? (suggestionReason && suggestionReason !== "none" ? suggestionReason : null),
    sourceName: row.autoSourceName,
    learnedCount: review?.learnedCount ?? null,
  });
  const question = questionText(row);
  return (
    <ListRow onOpen={onOpen}>
      <div className={listName}>
        <span className="inline-flex items-center gap-2">
          {row.payeeRaw}
          {review && review.level !== "none" ? <Badge variant="neutral">{levelLabel(review.level)}</Badge> : null}
        </span>
        <small>
          {formatDate(row.date)}
          {question ? ` · ${question}` : ""}
          {reason ? ` · ${reason}` : ""}
        </small>
        <span className="mt-2 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <RowAnswers row={row} pending={pending} planById={planById} asOf={asOf} onRun={onRun} />
        </span>
      </div>
      <div className={listAmt}>
        <Amount currency={currency} minor={row.amount} />
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </ListRow>
  );
}

function questionText(row: TransactionListItem): string {
  const review = row.review;
  if (!review) {
    return "";
  }
  if (review.question === "transfer_pair" && review.transfer) {
    return `Transfer with ${review.transfer.otherPayee}?`;
  }
  if (review.question === "recurring_ambiguous") {
    return "Which payment is this?";
  }
  if (review.question === "recurring_changed" && review.recurring?.actualAmount !== null && review.recurring?.expectedAmount !== null) {
    return "The amount changed. Update the plan?";
  }
  if (review.suggestion?.categoryId || review.suggestion?.transferAccountId) {
    return "Use this label?";
  }
  return "What is this?";
}

function RowAnswers({
  row,
  pending,
  planById,
  asOf,
  onRun,
}: {
  row: TransactionListItem;
  pending: boolean;
  planById: Map<string, Plan>;
  asOf: string;
  onRun: (action: () => Promise<{ ok: boolean }>) => Promise<void>;
}) {
  const review = row.review;
  if (!review) {
    return null;
  }
  if (review.question === "transfer_pair" && review.transfer && review.itemKey) {
    return (
      <>
        <Button
          type="button"
          disabled={pending}
          onClick={() => void onRun(() => acceptPair(asOf, row.id, review.transfer?.otherId ?? ""))}
        >
          Yes, a transfer
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => void onRun(() => decideItem(asOf, review.itemKey ?? "", "not_transfer"))}>
          Not a transfer
        </Button>
      </>
    );
  }
  if (review.question === "recurring_changed" && review.recurring && review.itemKey) {
    const recurring = review.recurring;
    const plan = planById.get(recurring.planId);
    const actual = recurring.actualAmount;
    return (
      <>
        <Button
          type="button"
          disabled={pending || !plan || actual === null}
          onClick={() => {
            if (plan && actual !== null) {
              void onRun(() => updatePlanAmount(plan, actual));
            }
          }}
        >
          Update the plan
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => void onRun(() => decideItem(asOf, review.itemKey ?? "", "keep_plan_amount"))}>
          Keep the recurring amount
        </Button>
      </>
    );
  }
  if (review.question === "recurring_ambiguous" && review.recurring) {
    const recurring = review.recurring;
    return (
      <Button type="button" disabled={pending} onClick={() => void onRun(() => linkOccurrence(recurring.planId, recurring.dueDate, row.id))}>
        Link this payment
      </Button>
    );
  }
  if (review.level === "sure") {
    return (
      <Button
        type="button"
        disabled={pending}
        onClick={() => void onRun(() => apiRequest(`/api/transactions/${row.id}/looks-right`, transactionSchema, { method: "POST" }))}
      >
        Looks right
      </Button>
    );
  }
  if (review.suggestion && (review.suggestion.categoryId || review.suggestion.transferAccountId)) {
    return (
      <Button type="button" disabled={pending} onClick={() => void onRun(() => applyInboxGroup(row.accountId, [row.id], review.suggestion!))}>
        Use this label
      </Button>
    );
  }
  return null;
}
