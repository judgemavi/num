import type { Plan, TransactionListItem } from "@num/shared";
import { Badge } from "@/components/ui/badge";
import { levelLabel, plainReason } from "@/transactions/format";
import { ReviewAnswers } from "@/transactions/review-answers";

export type Names = {
  categories: Map<string, string>;
  accounts: Map<string, string>;
  merchants: Map<string, string>;
};

type Target = { categoryId: string | null; transferAccountId: string | null };

function targetText(target: Target, names: Names): string {
  if (target.transferAccountId) {
    return `Transfer to ${names.accounts.get(target.transferAccountId) ?? "another account"}`;
  }
  if (target.categoryId) {
    return names.categories.get(target.categoryId) ?? "Uncategorized";
  }
  return "Uncategorized";
}

function currentText(row: TransactionListItem, names: Names): string {
  if (row.lines.length > 1) {
    return "Split";
  }
  return targetText(row.lines[0] ?? { categoryId: null, transferAccountId: null }, names);
}

function questionText(row: TransactionListItem): string | null {
  const review = row.review;
  if (!review) {
    return null;
  }
  if (review.question === "transfer_pair" && review.transfer) {
    return `Transfer with ${review.transfer.otherPayee}?`;
  }
  if (review.question === "recurring_ambiguous") {
    return "Which payment is this?";
  }
  if (review.question === "refund_purchase") {
    return "Refund of which purchase?";
  }
  if (review.question === "recurring_changed" && review.recurring?.actualAmount !== null && review.recurring?.expectedAmount !== null) {
    return "The amount changed. Update the plan?";
  }
  return null;
}

/** The proposed answer for a suggestion, or null. */
function proposalText(row: TransactionListItem, names: Names): string | null {
  const review = row.review;
  const suggestion = review?.suggestion;
  const proposes = review && review.level !== "sure" && review.question === "categorize" && suggestion;
  if (!proposes || !(suggestion.categoryId || suggestion.transferAccountId)) {
    return null;
  }
  const merchant = suggestion.merchantId ? names.merchants.get(suggestion.merchantId) : undefined;
  const label = targetText(suggestion, names);
  return `${suggestion.transferAccountId || !merchant ? label : `${label} · ${merchant}`}?`;
}

function reasonText(row: TransactionListItem): string {
  const review = row.review;
  const suggestionReason = review?.suggestion?.reason;
  return plainReason({
    reason: review ? (review.reason ?? (suggestionReason && suggestionReason !== "none" ? suggestionReason : null)) : row.autoReason,
    sourceName: row.autoSourceName,
    learnedCount: review?.learnedCount ?? row.autoLearnedCount,
    purchaseDate: row.refundOf?.date ?? null,
  });
}

type Props = {
  row: TransactionListItem;
  currency: string;
  names: Names;
  pending: boolean;
  planById: Map<string, Plan>;
  run: (action: () => Promise<{ ok: boolean }>) => Promise<void>;
};

/** The Category column. One cell for the label, the merchant and the review state. */
export function CategoryCell({ row, currency, names, pending, planById, run }: Props) {
  const review = row.review;
  const isQuestion = review !== null && review.question !== "categorize";
  const level = review ? review.level : row.autoReason ? "sure" : "none";
  const question = questionText(row);
  const reason = reasonText(row);
  const proposal = proposalText(row, names);
  const hasState = review !== null || row.autoReason !== null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {hasState && !isQuestion && level !== "none" ? <Badge variant="neutral">{levelLabel(level)}</Badge> : null}
        <span>{proposal ?? currentText(row, names)}</span>
      </div>
      {row.merchantName && !proposal ? <div className="text-muted-foreground">{row.merchantName}</div> : null}
      {question ? <div className="text-muted-foreground">{question}</div> : null}
      {hasState && reason ? <div className="text-sm text-muted-foreground">{reason}</div> : null}
      {hasState ? (
        <div className="mt-1 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <ReviewAnswers row={row} currency={currency} pending={pending} planById={planById} run={run} />
        </div>
      ) : null}
    </>
  );
}
