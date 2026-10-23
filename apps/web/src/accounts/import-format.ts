import { formatDate } from "@/date-format";
import type { BalanceCheck, ImportCounts, ImportRowOutcome, ImportViewStatus, UnreadableReason, UndoBlockReason, ErrorCode } from "@num/shared";

const unreadableText: Record<UnreadableReason, string> = {
  date_unreadable: "The date could not be read.",
  amount_unreadable: "The amount could not be read.",
  too_many_decimals: "The amount has too many decimal places.",
  amount_too_large: "The amount is too large.",
  sign_marker: "The amount uses a sign this file does not explain.",
};

const blockText: Record<UndoBlockReason, string> = {
  edited: "Edited after import",
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

const outcomeText: Record<ImportRowOutcome, string> = {
  created: "Created",
  matched: "Matched",
  needs_review: "Needs review",
  duplicate: "Duplicate",
  ignored: "Ignored",
};

const statusText: Record<ImportViewStatus, string> = {
  imported: "Imported",
  partly_undone: "Partly undone",
  undone: "Undone",
  needs_you: "Needs you",
};

export function importOutcomeLabel(outcome: ImportRowOutcome): string {
  return outcomeText[outcome];
}

export function importStatusLabel(status: ImportViewStatus): string {
  return statusText[status];
}

export function formatImportPeriod(start: string, end: string): string {
  if (start === end) {
    return formatStatementDate(start);
  }
  return `${formatStatementDate(start)} to ${formatStatementDate(end)}`;
}

export function formatStatementDate(iso: string): string {
  return formatDate(iso);
}

export function importError(code: ErrorCode | undefined): string {
  switch (code) {
    case "account_not_found":
      return "Choose an account.";
    case "preset_not_found":
      return "That bank format is not available.";
    case "statement_empty":
      return "The file has no transactions.";
    case "file_too_large":
      return "The file is larger than 20 MB.";
    case "setup_required":
      return "Finish setup before you import.";
    case "invalid_body":
      return "Check the file and the columns.";
    case "import_not_found":
      return "That import is not available.";
    case "internal_error":
      return "Something went wrong on the server. The server log has the details.";
    default:
      return "Something went wrong on the server. The server log has the details.";
  }
}

/** The difference of an import that broke the match with the bank. Null when the import shows no problem. */
export function brokenMatch(check: BalanceCheck): number | null {
  return check !== null && check.matchedBefore && check.difference !== 0 ? check.difference : null;
}

export function sampleSummary(count: number, first: string, last: string): string {
  return `${count} ${count === 1 ? "row" : "rows"} · ${formatImportPeriod(first, last)}`;
}
