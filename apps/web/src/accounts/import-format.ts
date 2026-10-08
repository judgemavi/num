import type { ImportCounts, UnreadableReason, UndoBlockReason } from "@num/shared";

const unreadableText: Record<UnreadableReason, string> = {
  date_unreadable: "The date could not be read.",
  amount_unreadable: "The amount could not be read.",
  too_many_decimals: "The amount has too many decimal places.",
  amount_too_large: "The amount is too large.",
  sign_marker: "The amount uses a sign this file does not explain.",
};

const blockText: Record<UndoBlockReason, string> = {
  edited: "Edited after import",
  reconciled: "Reconciled",
};

export function unreadableLabel(reason: UnreadableReason): string {
  return unreadableText[reason];
}

export function undoBlockLabel(reason: UndoBlockReason): string {
  return blockText[reason];
}

export function importCountText(counts: ImportCounts): string {
  const parts: string[] = [];
  if (counts.created > 0) {
    parts.push(`${counts.created} created`);
  }
  if (counts.matched > 0) {
    parts.push(`${counts.matched} matched`);
  }
  if (counts.duplicate > 0) {
    parts.push(`${counts.duplicate} ${counts.duplicate === 1 ? "duplicate" : "duplicates"}`);
  }
  if (counts.needsReview > 0) {
    parts.push(`${counts.needsReview} need review`);
  }
  if (counts.unreadable > 0) {
    parts.push(`${counts.unreadable} unreadable`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No rows";
}

export function formatImportDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

export function formatStatementDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}

export function importError(code: string): string {
  switch (code) {
    case "account_not_found":
      return "Choose an account.";
    case "preset_not_found":
      return "That bank format is not available.";
    case "statement_empty":
      return "The file has no transactions.";
    case "document_too_large":
      return "The file is larger than 20 MB.";
    case "setup_required":
      return "Finish setup before you import.";
    case "invalid_body":
      return "Check the file and the columns.";
    case "import_not_found":
      return "That import is not available.";
    default:
      return "The import did not finish.";
  }
}
