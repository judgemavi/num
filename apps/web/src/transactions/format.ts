import { Temporal, type AutoReason, type TransactionStatus } from "@num/shared";
import { formatMoney } from "@/money";

const statusLabels: Record<TransactionStatus, string> = {
  open: "Open",
  cleared: "Cleared",
};

export function reconciledLabel(): string {
  return "Reconciled";
}

export function statusLabel(status: TransactionStatus): string {
  return statusLabels[status];
}

export function formatDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { dateStyle: "medium" });
}

export function levelLabel(level: "sure" | "likely" | "maybe" | "none"): string {
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

export function plainReason(input: {
  reason: AutoReason | null;
  sourceName: string | null;
  learnedCount: number | null;
}): string {
  if (input.reason === "recurring") {
    return input.sourceName ? `Matches your ${input.sourceName} payment` : "Matches your recurring payment";
  }
  if (input.reason === "learned_amount" || input.reason === "learned_payee") {
    if (input.learnedCount === null) {
      return "You chose this for this payee";
    }
    const times = input.learnedCount === 1 ? "1 time" : `${input.learnedCount} times`;
    return `You chose this ${times} for this payee`;
  }
  if (input.reason === "similar") {
    return "Same as a similar payee";
  }
  if (input.reason === "merchant_default") {
    return "This merchant's usual category";
  }
  return "";
}

export function automaticReasonText(input: {
  reason: AutoReason;
  sourceName: string | null;
  learnedCount: number | null;
}): string {
  const reason = plainReason(input);
  return reason.length > 0 ? `Sure · ${reason}` : "Sure";
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

export function transactionError(code: string): string {
  switch (code) {
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
      return "The bank text stays as it was imported.";
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
    case "invalid_body":
      return "Check the transaction fields.";
    default:
      return "The transaction did not save. Try again.";
  }
}
