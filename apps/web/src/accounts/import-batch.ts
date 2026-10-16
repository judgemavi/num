import { chosenPresetId, firstStatementDate, orderByFirstDate, sampleCsvRows, type ColumnMap, type Account, type Preset } from "@num/shared";
import type { ImportFileRow } from "@/accounts/import-file-list";
import { importError } from "@/accounts/import-format";
import { rowNeedsColumnMap } from "@/accounts/import-prepare";
import { errorCode } from "@/api/client";
import type { importFile } from "@/api/imports";

/**
 * The files of the import editor and the progress of the batch.
 * - `reading`: the editor reads the files that the person chose.
 * - `running`: the batch imports the files, or waits for a column map.
 * - `finished`: the batch imported each file or has an error for it.
 */
export type ImportBatch = {
  rows: ImportFileRow[];
  phase: "idle" | "reading" | "running" | "finished";
};

type ImportBatchEvent =
  | { type: "readingStarted" }
  | { type: "filesRead"; rows: ImportFileRow[] }
  | { type: "rowsChanged"; rows: ImportFileRow[] }
  | { type: "rowChanged"; key: string; patch: Partial<ImportFileRow> }
  | { type: "batchStarted"; rows: ImportFileRow[] }
  | { type: "batchStopped" }
  | { type: "batchFinished" };

export const emptyImportBatch: ImportBatch = { rows: [], phase: "idle" };

export function importBatchReducer(batch: ImportBatch, event: ImportBatchEvent): ImportBatch {
  switch (event.type) {
    case "readingStarted":
      return { ...batch, phase: "reading" };
    case "filesRead":
      return { rows: [...batch.rows, ...event.rows], phase: "idle" };
    case "rowsChanged":
      return { ...batch, rows: event.rows };
    case "rowChanged":
      return { ...batch, rows: batch.rows.map((row) => (row.key === event.key ? { ...row, ...event.patch } : row)) };
    case "batchStarted":
      return { rows: event.rows, phase: "running" };
    case "batchStopped":
      return { ...batch, phase: "idle" };
    case "batchFinished":
      return { ...batch, phase: "finished" };
  }
}

type BatchIo = {
  presets: readonly Preset[];
  accounts: readonly Account[];
  /** Send one file to the API. */
  post: typeof importFile;
  asOf: string;
  /** Ask the person for the column map of a file. The answer is null when the person goes back. */
  askForMap: (row: ImportFileRow, preview: string[][]) => Promise<ColumnMap | null>;
  /** Tell the editor that a row changed. */
  onRow: (key: string, patch: Partial<ImportFileRow>) => void;
};

/**
 * Import the files that are ready, in the order of their first dates. First, the person gives the column map of each
 * file that needs one. When the API cannot read the columns of a file, the person gives the map for that file, and the
 * file is sent one more time. The batch stops when the person does not give a map.
 * The function keeps its own copy of the rows: no other code changes the rows while the batch runs.
 */
export async function runImportBatch(start: readonly ImportFileRow[], io: BatchIo): Promise<{ stopped: boolean; rows: ImportFileRow[] }> {
  const rows = new Map(start.map((row) => [row.key, row]));
  const result = (stopped: boolean) => ({ stopped, rows: [...rows.values()] });

  function change(key: string, patch: Partial<ImportFileRow>) {
    const row = rows.get(key);
    if (row) {
      rows.set(key, { ...row, ...patch });
      io.onRow(key, patch);
    }
  }

  async function postFile(row: ImportFileRow, allowPreview: boolean): Promise<"ok" | "stopped"> {
    if (row.accountId.length === 0) {
      change(row.key, { phase: "error", message: importError("account_not_found") });
      return "ok";
    }
    change(row.key, { phase: "importing", message: null });
    try {
      const answer = await io.post({ file: row.file, accountId: row.accountId, asOf: io.asOf, presetId: chosenPresetId(row.format), columnMap: row.columnMap });
      if (answer.kind === "preview") {
        if (!allowPreview) {
          change(row.key, { phase: "error", message: importError("invalid_body") });
          return "ok";
        }
        const map = await io.askForMap(row, answer.rows);
        if (!map) {
          change(row.key, { phase: "ready" });
          return "stopped";
        }
        change(row.key, { columnMap: map, firstDate: firstStatementDate(row.text, { kind: "unknown" }, io.presets, map), phase: "ready" });
        const latest = rows.get(row.key);
        return latest ? postFile(latest, false) : "stopped";
      }
      if (answer.kind === "unreadable") {
        change(row.key, {
          phase: "done",
          alreadyImported: false,
          batchId: null,
          createdAt: null,
          unreadable: answer.unreadable,
          counts: { created: 0, matched: 0, duplicate: 0, needsReview: 0, unreadable: answer.unreadable.length },
        });
        return "ok";
      }
      change(row.key, {
        phase: "done",
        alreadyImported: answer.alreadyImported,
        counts: answer.alreadyImported ? null : answer.counts,
        unreadable: answer.unreadable,
        batchId: answer.id,
        createdAt: answer.createdAt,
        openingSuggestion: answer.openingSuggestion,
        message: null,
      });
      return "ok";
    } catch (error) {
      change(row.key, { phase: "error", message: importError(error instanceof Error ? errorCode(error) : undefined) });
      return "ok";
    }
  }

  for (const row of start.filter((row) => rowNeedsColumnMap(row, io.accounts.find((account) => account.id === row.accountId)))) {
    const map = await io.askForMap(row, sampleCsvRows(row.text));
    if (!map) {
      return result(true);
    }
    change(row.key, { columnMap: map, firstDate: firstStatementDate(row.text, { kind: "unknown" }, io.presets, map) });
  }
  for (const row of orderByFirstDate([...rows.values()].filter((item) => item.phase === "ready"))) {
    if ((await postFile(rows.get(row.key) ?? row, true)) === "stopped") {
      return result(true);
    }
  }
  return result(false);
}
