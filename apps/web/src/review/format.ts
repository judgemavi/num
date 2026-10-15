import type { InboxDecisionCode, ErrorCode } from "@num/shared";

export function decisionText(code: InboxDecisionCode): string {
  switch (code) {
    case "not_transfer":
      return "Not a transfer";
    case "keep_plan_amount":
      return "Kept the recurring amount";
    case "not_recurring":
      return "Not a repeating payment";
    case "not_a_transaction":
      return "Not a transaction";
    case "not_linked":
      return "Not linked to a purchase";
    case "keep_uncategorized":
      return "Kept without a category";
  }
}

export function inboxError(code: ErrorCode | undefined): string {
  switch (code) {
    case "import_match_invalid":
      return "That match is no longer available.";
    case "import_review_not_found":
      return "That import row is already decided.";
    case "transfer_pair_not_found":
      return "That transfer is no longer available.";
    case "bucket_not_overspent":
      return "That bucket is no longer over.";
    case "bucket_short":
      return "That bucket does not have enough to cover this.";
    case "fund_over_unassigned":
      return "Unassigned does not have enough to cover this.";
    case "inbox_item_not_found":
      return "That item no longer needs an answer.";
    case "decision_not_found":
      return "That decision is already undone.";
    case "occurrence_taken":
      return "That occurrence already has a decision.";
    default:
      return "The change did not save. Try again.";
  }
}
