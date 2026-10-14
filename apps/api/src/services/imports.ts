import { createHash } from "node:crypto";
import { accounts, documents, importBatches, importRows, settings, transactions, type AccountRow } from "@num/db";
import {
  chosenPresetId,
  detectStatementFormat,
  isOfxFile,
  minorUnitDigits,
  sampleCsvRows,
  Temporal,
  utcNow,
  type ColumnMap,
  type ImportResult,
} from "@num/shared";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { restoreDocument } from "./documents";
import { planImportRows } from "./import-plan";
import { presentBatch } from "./import-read";
import { saveImportBatch } from "./import-save";
import { parseCsvStatement } from "./parse-csv";
import { importOpeningSuggestion } from "./opening-suggestion";
import { parseOfxStatement } from "./parse-ofx";
import { loadPreset, loadPresets } from "./presets";
import { autoLink } from "./recurring-view";
import type { ParsedStatement } from "./statement";
import type { AuditSource } from "./write";

type ImportInput = {
  source: AuditSource;
  at?: string;
  accountId: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  presetId?: string | null;
  columnMap?: ColumnMap | null;
  asOf?: string;
};

type ReadyParse = {
  parser: "ofx" | "csv";
  statement: ParsedStatement;
  presetId: string | null;
  columnMap: ColumnMap | null;
};

function minorDigits(db: Db) {
  const row = db.select().from(settings).where(eq(settings.key, "currency")).get();
  const digits = row ? minorUnitDigits(row.value) : undefined;
  if (digits === undefined) {
    throw new ServiceError("setup_required", 400);
  }
  return digits;
}

function textOf(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function previewRows(text: string) {
  return sampleCsvRows(text, 6);
}

function presetMap(id: string): ColumnMap {
  try {
    return loadPreset(id);
  } catch {
    throw new ServiceError("preset_not_found", 400);
  }
}

function savedOrDetectedPreset(
  filename: string,
  text: string,
  importPreset: string | null,
): { presetId: string; map: ColumnMap } | null {
  if (!importPreset) {
    return null;
  }
  try {
    return { presetId: importPreset, map: loadPreset(importPreset) };
  } catch {
    const presetId = chosenPresetId(detectStatementFormat(filename, text, loadPresets()));
    if (!presetId) {
      return null;
    }
    try {
      return { presetId, map: loadPreset(presetId) };
    } catch {
      return null;
    }
  }
}

function resolveParse(
  filename: string,
  text: string,
  digits: number,
  account: Pick<AccountRow, "importPreset" | "columnMap">,
  request: { presetId: string | null; columnMap: ColumnMap | null },
): ReadyParse | { kind: "preview"; rows: string[][] } {
  if (request.columnMap) {
    return {
      parser: "csv",
      statement: parseCsvStatement(text, request.columnMap, digits),
      presetId: null,
      columnMap: request.columnMap,
    };
  }
  if (request.presetId) {
    return {
      parser: "csv",
      statement: parseCsvStatement(text, presetMap(request.presetId), digits),
      presetId: request.presetId,
      columnMap: null,
    };
  }
  if (isOfxFile(filename, text)) {
    return { parser: "ofx", statement: parseOfxStatement(text, digits), presetId: null, columnMap: null };
  }
  const saved = savedOrDetectedPreset(filename, text, account.importPreset);
  if (saved) {
    return {
      parser: "csv",
      statement: parseCsvStatement(text, saved.map, digits),
      presetId: saved.presetId,
      columnMap: null,
    };
  }
  if (account.columnMap) {
    return { parser: "csv", statement: parseCsvStatement(text, account.columnMap, digits), presetId: null, columnMap: null };
  }
  const rows = previewRows(text);
  if (rows.length === 0) {
    throw new ServiceError("statement_empty", 400);
  }
  return { kind: "preview", rows };
}

function dateWindow(dates: readonly string[]) {
  const ordered = [...dates].sort();
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) {
    throw new Error("A batch needs a statement row");
  }
  return {
    start: Temporal.PlainDate.from(first).subtract({ days: 3 }).toString(),
    end: Temporal.PlainDate.from(last).add({ days: 3 }).toString(),
  };
}

export function listImportPresets() {
  return {
    presets: loadPresets(),
  };
}

export function listImportBatches(db: Db, accountId: string) {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const batches = db
    .select()
    .from(importBatches)
    .where(eq(importBatches.accountId, accountId))
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .all();
  return { items: batches.map((batch) => presentBatch(db, batch)) };
}

export function importStatement(db: Db, dataDir: string, input: ImportInput): ImportResult {
  const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const at = input.at ?? utcNow();
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const stored = db.select().from(documents).where(eq(documents.hash, hash)).get();
  if (stored) {
    const existing = db
      .select()
      .from(importBatches)
      .where(eq(importBatches.documentId, stored.id))
      .all()
      .find((batch) => batch.undoneAt === null);
    if (existing) {
      if (stored.deletedAt) {
        restoreDocument(db, stored.id, { source: input.source, at });
      }
      return { kind: "batch", alreadyImported: true, openingSuggestion: null, ...presentBatch(db, existing) };
    }
  }

  const text = textOf(input.bytes);
  const resolved = resolveParse(input.filename, text, minorDigits(db), account, {
    presetId: input.presetId ?? null,
    columnMap: input.columnMap ?? null,
  });
  if ("kind" in resolved) {
    return resolved;
  }
  if (resolved.statement.rows.length === 0) {
    if (resolved.statement.unreadable.length > 0) {
      return { kind: "unreadable", unreadable: resolved.statement.unreadable };
    }
    throw new ServiceError("statement_empty", 400);
  }

  const window = dateWindow(resolved.statement.rows.map((row) => row.date));
  const taken = new Set(
    db
      .select({ identity: importRows.identity })
      .from(importRows)
      .where(
        and(
          eq(importRows.accountId, account.id),
          eq(importRows.active, true),
          sql`${importRows.outcome} <> 'duplicate'`,
        ),
      )
      .all()
      .map((row) => row.identity),
  );
  const candidates = db
    .select({ id: transactions.id, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        isNull(transactions.importRowId),
        gte(transactions.date, window.start),
        lte(transactions.date, window.end),
      ),
    )
    .all();
  const planned = planImportRows(
    account.id,
    resolved.statement.rows.map((row) => ({
      date: row.date,
      amount: row.amount,
      payeeRaw: row.description,
      bankId: row.bankId,
    })),
    taken,
    candidates,
  );
  const filename = input.filename.split(/[/\\]/).pop()?.replace(/[\r\n"]/g, "").trim() || "upload";
  const mimeType = input.mimeType.trim() || "application/octet-stream";
  const document = stored ?? {
    id: crypto.randomUUID(),
    filename,
    hash,
    mimeType,
    storagePath: `uploads/${hash}`,
    uploadedAt: at,
    deletedAt: null,
  };
  const openingSuggestion = importOpeningSuggestion(
    db,
    account.id,
    resolved.parser === "csv" ? resolved.statement.firstRow : null,
  );
  const batch = saveImportBatch(db, {
    source: input.source,
    at,
    accountId: account.id,
    dataDir,
    bytes: stored ? null : input.bytes,
    document: stored
      ? { ...stored, filename: stored.filename }
      : { ...document, filename },
    newFile: !stored,
    restoreDocument: stored?.deletedAt != null,
    parser: resolved.parser,
    rows: planned,
    closingBalance: resolved.statement.closingBalance,
    closingDate: resolved.statement.closingDate,
    unreadable: resolved.statement.unreadable,
    presetId: resolved.presetId,
    columnMap: resolved.columnMap,
    asOf: input.asOf ?? null,
  });
  if (input.asOf) {
    try {
      autoLink(db, input.asOf, { source: input.source, at, accountId: account.id });
    } catch (error) {
      console.error("Recurring auto-link failed after import", error);
    }
  }
  return { kind: "batch", alreadyImported: false, openingSuggestion, ...batch };
}
