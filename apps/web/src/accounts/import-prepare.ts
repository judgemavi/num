import {
  detectStatementFormat,
  firstStatementDate,
  guessImportAccount,
  type Account,
  type ColumnMap,
  type ImportCounts,
  type Preset,
  type StatementFormat,
} from "@num/shared";
import type { ImportFileRow } from "@/accounts/import-file-list";
import { importError } from "@/accounts/import-format";

const columnsValue = "columns";
const ofxValue = "ofx";

export function formatFromChoice(value: string): StatementFormat {
  if (value === ofxValue) {
    return { kind: "ofx" };
  }
  if (value === columnsValue) {
    return { kind: "unknown" };
  }
  return { kind: "preset", presetId: value };
}

export function rowNeedsColumnMap(row: ImportFileRow): boolean {
  return row.phase === "ready" && row.format.kind === "unknown" && row.columnMap === null && row.accountId.length > 0;
}

export function totalCounts(rows: readonly ImportFileRow[]): ImportCounts {
  return rows.reduce(
    (sum, row) => {
      if (row.phase !== "done" || row.alreadyImported || row.counts === null) {
        return sum;
      }
      return {
        created: sum.created + row.counts.created,
        matched: sum.matched + row.counts.matched,
        duplicate: sum.duplicate + row.counts.duplicate,
        needsReview: sum.needsReview + row.counts.needsReview,
        unreadable: sum.unreadable + row.counts.unreadable,
      };
    },
    { created: 0, matched: 0, duplicate: 0, needsReview: 0, unreadable: 0 },
  );
}

const maxBytes = 20 * 1024 * 1024;

export function knownAccount(accounts: readonly Account[], fallback: Account | null, accountId: string): Account | null {
  return accounts.find((item) => item.id === accountId) ?? (fallback?.id === accountId ? fallback : null);
}

export function dateFor(
  text: string,
  format: StatementFormat,
  columnMap: ColumnMap | null,
  account: Account | null,
  presets: readonly Preset[],
): string | null {
  if (text.length === 0) {
    return null;
  }
  if (format.kind === "ofx" || format.kind === "preset" || format.kind === "ambiguous") {
    return firstStatementDate(text, format, presets);
  }
  if (columnMap) {
    return firstStatementDate(text, { kind: "unknown" }, presets, columnMap);
  }
  if (account?.columnMap) {
    return firstStatementDate(text, { kind: "unknown" }, presets, account.columnMap);
  }
  if (account?.importPreset) {
    return firstStatementDate(text, { kind: "preset", presetId: account.importPreset }, presets);
  }
  return null;
}

export function syncImportRows(
  current: readonly ImportFileRow[],
  presets: readonly Preset[],
  accounts: readonly Account[],
  applyAccountId: string | null,
  fallbackId: string,
  fallback: Account | null,
): ImportFileRow[] | null {
  let changed = false;
  const next = current.map((row) => {
    if (row.phase !== "ready" || row.text.length === 0) {
      return row;
    }
    const format = row.formatTouched ? row.format : detectStatementFormat(row.file.name, row.text, presets);
    const accountId = row.accountTouched
      ? row.accountId
      : (applyAccountId ?? guessImportAccount(accounts, format, presets) ?? fallbackId);
    const chosen = knownAccount(accounts, fallback, accountId);
    const firstDate = dateFor(row.text, format, row.columnMap, chosen, presets);
    if (sameFormat(format, row.format) && accountId === row.accountId && firstDate === row.firstDate) {
      return row;
    }
    changed = true;
    return { ...row, format, accountId, firstDate };
  });
  return changed ? next : null;
}

function sameFormat(left: StatementFormat, right: StatementFormat): boolean {
  if (left.kind === "preset" && right.kind === "preset") {
    return left.presetId === right.presetId;
  }
  if (left.kind === "ambiguous" && right.kind === "ambiguous") {
    return left.candidates.join("\n") === right.candidates.join("\n");
  }
  return left.kind === right.kind;
}

export async function readImportFile(
  file: File,
  presets: readonly Preset[],
  accounts: readonly Account[],
  applyAccountId: string | null,
  fallbackId: string,
  fallback: Account | null,
): Promise<ImportFileRow> {
  const base = {
    key: crypto.randomUUID(),
    file,
    columnMap: null,
    counts: null,
    batchId: null,
    alreadyImported: false,
    unreadable: [],
    createdAt: null,
    openingSuggestion: null,
  };
  if (file.size > maxBytes) {
    return {
      ...base,
      text: "",
      format: { kind: "unknown" },
      formatTouched: true,
      accountId: "",
      accountTouched: true,
      firstDate: null,
      phase: "error",
      message: importError("document_too_large"),
    };
  }
  try {
    const text = await file.text();
    const format = detectStatementFormat(file.name, text, presets);
    const accountId = applyAccountId ?? guessImportAccount(accounts, format, presets) ?? fallbackId;
    const chosen = knownAccount(accounts, fallback, accountId);
    return {
      ...base,
      text,
      format,
      formatTouched: false,
      accountId,
      accountTouched: applyAccountId !== null,
      firstDate: dateFor(text, format, null, chosen, presets),
      phase: "ready",
      message: null,
    };
  } catch {
    return {
      ...base,
      text: "",
      format: { kind: "unknown" },
      formatTouched: true,
      accountId: "",
      accountTouched: true,
      firstDate: null,
      phase: "error",
      message: importError("internal_error"),
    };
  }
}
