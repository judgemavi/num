import { createHash } from "node:crypto";
import { accounts, documents, importBatches, importRows, settings, transactions } from "@num/db";
import {
  minorUnitDigits,
  Temporal,
  utcNow,
  type ColumnMap,
  type ImportResult,
} from "@num/shared";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { readColumnMap } from "./account-snapshot";
import { restoreDocument } from "./documents";
import { planImportRows } from "./import-plan";
import { batchForDocument, presentBatch } from "./import-read";
import { saveImportBatch } from "./import-save";
import { parseCsvStatement, splitCsvLine } from "./parse-csv";
import { parseOfxStatement } from "./parse-ofx";
import { loadPreset, loadPresets } from "./presets";
import { suggestForPayee } from "./suggestions";
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
};

type ReadyParse = {
  parser: "ofx" | "csv";
  statement: ParsedStatement;
  presetId: string | null;
  columnMap: ColumnMap | null;
};

function minorDigits(db: Db): number {
  const row = db.select().from(settings).where(eq(settings.key, "currency")).get();
  const digits = row ? minorUnitDigits(row.value) : undefined;
  if (digits === undefined) {
    throw new ServiceError("setup_required", 400);
  }
  return digits;
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function isOfx(filename: string, text: string): boolean {
  if (/\.(ofx|qfx)$/i.test(filename)) {
    return true;
  }
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 500));
}

function previewRows(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 6)
    .map((line) => splitCsvLine(line));
}

function presetMap(id: string): ColumnMap {
  try {
    return loadPreset(id);
  } catch {
    throw new ServiceError("preset_not_found", 400);
  }
}

function resolveParse(
  filename: string,
  text: string,
  digits: number,
  account: { importPreset: string | null; columnMap: string | null },
  request: { presetId: string | null; columnMap: ColumnMap | null },
): ReadyParse | { kind: "preview"; rows: string[][] } {
  if (isOfx(filename, text)) {
    return { parser: "ofx", statement: parseOfxStatement(text, digits), presetId: null, columnMap: null };
  }
  if (request.columnMap) {
    return {
      parser: "csv",
      statement: parseCsvStatement(text, request.columnMap, digits),
      presetId: null,
      columnMap: request.columnMap,
    };
  }
  const presetId = request.presetId ?? account.importPreset;
  if (presetId) {
    return {
      parser: "csv",
      statement: parseCsvStatement(text, presetMap(presetId), digits),
      presetId,
      columnMap: null,
    };
  }
  const saved = readColumnMap(account.columnMap);
  if (saved) {
    return { parser: "csv", statement: parseCsvStatement(text, saved, digits), presetId: null, columnMap: null };
  }
  const rows = previewRows(text);
  if (rows.length === 0) {
    throw new ServiceError("statement_empty", 400);
  }
  return { kind: "preview", rows };
}

function dateWindow(dates: readonly string[]): { start: string; end: string } {
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
    presets: loadPresets().map((preset) => ({ id: preset.id, name: preset.name })),
  };
}

export function listImportBatches(db: Db, accountId: string) {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const batches = db.select().from(importBatches).where(eq(importBatches.accountId, accountId)).all();
  batches.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.id < right.id ? 1 : -1;
  });
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
    const existing = batchForDocument(db, stored.id);
    if (existing) {
      if (stored.deletedAt) {
        restoreDocument(db, stored.id, { source: input.source, at });
      }
      return { kind: "batch", alreadyImported: true, ...presentBatch(db, existing) };
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
        isNull(transactions.deletedAt),
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
  ).map((row) =>
    row.outcome === "created" ? { ...row, suggestion: suggestForPayee(db, account.id, row.payeeRaw) } : row,
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
  });
  return { kind: "batch", alreadyImported: false, ...batch };
}
