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

export function automaticReasonText(input: {
  confidence: number | null;
  reason: AutoReason;
  sourceName: string | null;
  learnedCount: number | null;
}): string {
  const parts: string[] = [];
  if (input.confidence !== null) {
    parts.push(`${new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(input.confidence / 1000)} sure`);
  }
  if (input.reason === "recurring") {
    parts.push(input.sourceName ? `Recurring: ${input.sourceName}` : "Recurring");
  }
  if (input.reason === "similar" && input.sourceName) {
    parts.push(`Similar: ${input.sourceName}`);
  }
  if (input.reason === "merchant_default") {
    parts.push(input.sourceName ? `Merchant: ${input.sourceName}` : "Merchant default");
  }
  if (input.learnedCount && input.learnedCount > 0 && input.reason !== "merchant_default") {
    const answers = input.learnedCount === 1 ? "answer" : "answers";
    parts.push(`learned from ${input.learnedCount} ${answers}`);
  }
  return parts.join(" · ");
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
