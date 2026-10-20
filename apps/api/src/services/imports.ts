import { createHash } from "node:crypto";
import { accounts, importBatches, importRows, settings, transactions, type AccountRow } from "@num/db";
import {
  chosenPresetId,
  ofxPresetId,
  detectStatementFormat,
  isOfxFile,
  currencyDigits,
  parseCsvStatement,
  parseOfxStatement,
  sampleCsvRows,
  addDays,
  matchDateWindowDays,
  utcNow,
  type ColumnMap,
  type ImportResult,
  type ParsedStatement,
} from "@num/shared";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { planImportRows } from "./import-plan";
import { presentBatch } from "./import-read";
import { saveImportBatch } from "./import-save";
import { importOpeningSuggestion } from "./opening-suggestion";
import { loadPresets } from "./presets";
import type { AuditSource } from "./write";

const presets = loadPresets();
const presetsById = new Map(presets.map((preset) => [preset.id, preset]));

type ImportInput = {
  source: AuditSource;
  at?: string;
  accountId: string;
  filename: string;
  bytes: Uint8Array;
  presetId?: string | null;
  columnMap?: ColumnMap | null;
  asOf: string;
};

type ReadyParse = {
  parser: "ofx" | "csv";
  statement: ParsedStatement;
  presetId: string | null;
  columnMap: ColumnMap | null;
};

function currencyDigitsOf(db: Db) {
  const row = db.select().from(settings).where(eq(settings.key, "currency")).get();
  const digits = row ? currencyDigits(row.value) : undefined;
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
  const preset = presetsById.get(id);
  if (!preset) {
    throw new ServiceError("preset_not_found", 400);
  }
  return preset;
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
    return { presetId: importPreset, map: presetMap(importPreset) };
  } catch {
    const presetId = chosenPresetId(detectStatementFormat(filename, text, presets));
    if (!presetId) {
      return null;
    }
    try {
      return { presetId, map: presetMap(presetId) };
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
  if (request.presetId === ofxPresetId) {
    return { parser: "ofx", statement: parseOfxStatement(text, digits), presetId: ofxPresetId, columnMap: null };
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
    start: addDays(first, -matchDateWindowDays),
    end: addDays(last, matchDateWindowDays),
  };
}

export function listImportPresets() {
  return {
    presets,
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

/** The same file again: the batch that is not undone with the hash of the file. */
function activeBatchWithHash(db: Db, hash: string) {
  return db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.hash, hash), isNull(importBatches.undoneAt)))
    .get();
}

export function importStatement(db: Db, input: ImportInput): ImportResult {
  const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const at = input.at ?? utcNow();
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const existing = activeBatchWithHash(db, hash);
  if (existing) {
    return { kind: "batch", alreadyImported: true, openingSuggestion: null, ...presentBatch(db, existing) };
  }

  const text = textOf(input.bytes);
  const resolved = resolveParse(input.filename, text, currencyDigitsOf(db), account, {
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
  const openingSuggestion = importOpeningSuggestion(
    db,
    account.id,
    resolved.parser === "csv" ? resolved.statement.firstRow : null,
  );
  const batch = saveImportBatch(db, {
    source: input.source,
    at,
    accountId: account.id,
    filename,
    hash,
    parser: resolved.parser,
    rows: planned,
    closingBalance: resolved.statement.closingBalance,
    closingDate: resolved.statement.closingDate,
    unreadable: resolved.statement.unreadable,
    presetId: resolved.presetId,
    columnMap: resolved.columnMap,
    asOf: input.asOf,
  });
  return { kind: "batch", alreadyImported: false, openingSuggestion, ...batch };
}
