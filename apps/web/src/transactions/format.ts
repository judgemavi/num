import { Temporal, type ErrorCode, type ReviewLevel } from "@num/shared";
import { formatMoney } from "@/money";

export function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { dateStyle: "medium" });
}

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

/** The text of the toast after approve or a bulk edit (decision 0051): "10 approved · 2 skipped". */
export function countText(done: number, doneWord: string, skipped: number): string {
  return skipped > 0 ? `${done} ${doneWord} · ${skipped} skipped` : `${done} ${doneWord}`;
}

export function refundOfText(currency: string, date: string, amount: number): string {
  const day = Temporal.PlainDate.from(date).toLocaleString(undefined, { month: "short", day: "numeric" });
  return `Refund of ${day} · ${formatMoney(currency, Math.abs(amount))}`;
}

export function refundPurchaseLabel(currency: string, payee: string, date: string, amount: number): string {
  const day = Temporal.PlainDate.from(date).toLocaleString(undefined, { month: "short", day: "numeric" });
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
    case "transfer_line_limit":
      return "A transaction can have one transfer line.";
    case "mirror_amount_locked":
      return "Change this amount on the other side of the transfer.";
    case "mirror_one_line":
      return "This side of the transfer has one line.";
    case "transaction_reconciled":
      return "Unlock the checkpoint before you change this transaction.";
    case "paycheck_funded":
      return "Undo the funding first.";
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
    case "plan_not_found":
    case "plan_archived":
      return "That payment is no longer open.";
    case "transaction_already_linked":
      return "This transaction is already the payment of a recurring item.";
    case "invalid_body":
      return "Check the transaction fields.";
    default:
      return "The transaction did not save. Try again.";
  }
}
