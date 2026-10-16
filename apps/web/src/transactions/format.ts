import { formatCalendarDate } from "@/date-format";
import { type ErrorCode, type ReviewLevel, type TransactionReview } from "@num/shared";
import { formatMoney } from "@/money";


export function levelLabel(level: ReviewLevel): string {
  if (level === "sure") {
    return "Sure";
  }
  if (level === "likely") {
    return "Likely";
  }
  if (level === "maybe") {
    return "Maybe";
  }
  return "No suggestion";
}

/**
 * The review text of a row in the table. On the All page: the level of a suggestion or of an automatic label, and
 * "Needs review" for a question or no suggestion. On the Needs review page: "Question" for a question, the level, and
 * nothing for no suggestion. A row that does not need review has no text.
 */
export function reviewText(review: TransactionReview | null, onReview: boolean): string | null {
  if (review === null) {
    return null;
  }
  if (review.question !== "categorize") {
    return onReview ? "Question" : "Needs review";
  }
  if (review.level === "none") {
    return onReview ? null : "Needs review";
  }
  return levelLabel(review.level);
}

/** The text of the toast after approve or a bulk edit: "10 approved · 2 skipped". */
export function countText(done: number, doneWord: string, skipped: number): string {
  return skipped > 0 ? `${done} ${doneWord} · ${skipped} skipped` : `${done} ${doneWord}`;
}

export function refundOfText(currency: string, date: string, amount: number): string {
  const day = formatCalendarDate(date, { month: "short", day: "numeric" });
  return `Refund of ${day} · ${formatMoney(currency, Math.abs(amount))}`;
}

export function refundPurchaseLabel(currency: string, payee: string, date: string, amount: number): string {
  const day = formatCalendarDate(date, { month: "short", day: "numeric" });
  return `${payee} · ${day} · ${formatMoney(currency, Math.abs(amount))}`;
}

export function refundedText(currency: string, amount: number): string {
  return `Refunded ${formatMoney(currency, amount)}`;
}

export function transactionError(code: ErrorCode | undefined): string {
  switch (code) {
    case "amount_too_precise":
      return "An amount has more decimal places than the currency has.";
    case "lines_sum_mismatch":
      return "The lines must add up to the amount.";
    case "lines_required":
      return "Add at least one line.";
    case "line_target_conflict":
      return "A line can have a category or a transfer, not both.";
    case "transfer_same_account":
      return "A transfer must go to a different account.";
    case "lines_not_loan_payment":
      return "A transaction with two lines must be a loan payment: interest and principal.";
    case "mirror_amount_locked":
      return "Change this amount on the other side of the transfer.";
    case "mirror_one_line":
      return "This side of the transfer has one line.";
    case "payee_raw_locked":
      return "The description of an imported transaction does not change.";
    case "account_archived":
      return "Choose an active account.";
    case "category_archived":
      return "Choose an active category.";
    case "tag_archived":
      return "Choose an active tag.";
    case "merchant_archived":
    case "merchant_not_found":
      return "Choose an active merchant.";
    case "account_not_found":
      return "That account is not in the book.";
    case "transaction_not_found":
      return "That transaction is not in the book.";
    case "refund_link_invalid":
      return "Choose a recent purchase for this refund.";
    case "transfer_pair_not_found":
      return "That transfer match is no longer available. Choose the account again.";
    case "occurrence_taken":
    case "occurrence_not_found":
    case "schedule_not_found":
    case "bucket_archived":
      return "That payment is no longer open.";
    case "transaction_already_linked":
      return "This transaction is already the payment of a bill or an income.";
    case "invalid_body":
      return "Check the transaction fields.";
    default:
      return "The transaction did not save. Try again.";
  }
}
