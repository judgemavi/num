import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, documents, migrateDatabase, openDatabase, transactions } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { eraseDocument, readDocumentFile } from "./documents";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { runSetup } from "./setup";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };
const map = columnMapSchema.parse({ hasHeader: true, date: 0, description: 1, amount: 2, dateOrder: "mdy", signConvention: "account" });
const bytes = new TextEncoder().encode("date,description,amount\n03/04/2026,CITY TRANSIT,-2.00\n03/05/2026,CORNER SHOP,-7.50\n");

function withBook(run: (db: Db, dir: string, accountId: string) => void | Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "num-documents-"));
    const sqlite = openDatabase(join(dir, "num.sqlite"));
    migrateDatabase(sqlite);
    const db = createDb(sqlite);
    runSetup(db, { asOf: "2026-10-07", currency: "CAD", categorySet: "none", ...saved });
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    try {
      await run(db, dir, account.id);
    } finally {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function importFile(db: Db, dir: string, accountId: string) {
  const result = importStatement(db, dir, { ...saved, accountId, filename: "march.csv", mimeType: "text/csv", bytes, columnMap: map });
  if (result.kind !== "batch") {
    throw new Error("Expected an import batch");
  }
  return result;
}

function documentOf(db: Db, id: string | null) {
  const row = db.select().from(documents).where(eq(documents.id, id ?? "")).get();
  if (!row) {
    throw new Error("Expected a document");
  }
  return row;
}

test(
  "erasing a document deletes the file and keeps its record, its import and its transactions",
  withBook((db, dir, accountId) => {
    const batch = importFile(db, dir, accountId);
    const before = documentOf(db, batch.documentId);
    expect(readDocumentFile(db, dir, before.id).bytes).toEqual(bytes);

    const erased = eraseDocument(db, dir, before.id, { ...saved, at: "2026-10-08T16:00:00Z" });
    expect(erased).toEqual({ ...before, deletedAt: "2026-10-08T16:00:00Z" });
    expect(readdirSync(join(dir, "uploads"))).toEqual([]);
    expect(() => readDocumentFile(db, dir, before.id)).toThrow("document_not_found");
    expect(() => eraseDocument(db, dir, before.id, saved)).toThrow("document_not_found");
    expect(db.select().from(transactions).all()).toHaveLength(2);
    const audit = db.select().from(auditLog).where(eq(auditLog.entityId, before.id)).all();
    expect(audit.map((row) => row.action)).toEqual(["create", "delete"]);
  }),
);

test(
  "the same file after an erase is stored again and shows the import that is still active",
  withBook((db, dir, accountId) => {
    const batch = importFile(db, dir, accountId);
    const id = documentOf(db, batch.documentId).id;
    eraseDocument(db, dir, id, saved);

    const again = importFile(db, dir, accountId);
    expect(again.alreadyImported).toBe(true);
    expect(again.id).toBe(batch.id);
    expect(documentOf(db, id).deletedAt).toBeNull();
    expect(readDocumentFile(db, dir, id).bytes).toEqual(bytes);
    expect(db.select().from(transactions).all()).toHaveLength(2);
  }),
);

test(
  "the same file after an erase of an undone import is stored again and imported again",
  withBook((db, dir, accountId) => {
    const batch = importFile(db, dir, accountId);
    const id = documentOf(db, batch.documentId).id;
    undoImportBatch(db, batch.id, saved);
    eraseDocument(db, dir, id, saved);
    expect(existsSync(join(dir, "uploads", documentOf(db, id).hash))).toBe(false);

    const again = importFile(db, dir, accountId);
    expect(again.alreadyImported).toBe(false);
    expect(again.documentId).toBe(id);
    expect(documentOf(db, id).deletedAt).toBeNull();
    expect(readDocumentFile(db, dir, id).bytes).toEqual(bytes);
    expect(db.select().from(transactions).all()).toHaveLength(2);
  }),
);

test(
  "an import larger than 20 MB returns document_too_large",
  withBook(async (db, dir, accountId) => {
    const app = createApp(db, { dataDir: dir });
    const large = new FormData();
    large.set("accountId", accountId);
    large.set("file", new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.csv", { type: "text/csv" }));
    const rejected = await app.request("/api/imports", { method: "POST", body: large });
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({ code: "document_too_large", params: {} });
  }),
);
