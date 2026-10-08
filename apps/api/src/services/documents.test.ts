import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createApp } from "../app";
import { createDb } from "../db";
import { deleteDocument, uploadDocument } from "./documents";

test("a duplicate document hash returns the existing document", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-documents-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  const bytes = new TextEncoder().encode("synthetic-statement-v1\n");

  try {
    const first = uploadDocument(db, dir, {
      bytes,
      filename: "statement.csv",
      mimeType: "text/csv",
      source: "ui",
      at: "2026-10-07T16:00:00Z",
    });
    const second = uploadDocument(db, dir, {
      bytes,
      filename: "copy.csv",
      mimeType: "text/csv",
      source: "ui",
      at: "2026-10-08T16:00:00Z",
    });

    expect(second).toEqual(first);
    expect(readdirSync(join(dir, "uploads"))).toEqual([first.hash]);
    expect(db.select().from(auditLog).all()).toHaveLength(1);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("re-upload of a deleted document restores it", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-documents-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  const bytes = new TextEncoder().encode("synthetic-statement-v2\n");

  try {
    const first = uploadDocument(db, dir, {
      bytes,
      filename: "statement.csv",
      mimeType: "text/csv",
      source: "ui",
      at: "2026-10-07T16:00:00Z",
    });
    deleteDocument(db, first.id, { source: "ui", at: "2026-10-08T16:00:00Z" });
    const restored = uploadDocument(db, dir, {
      bytes,
      filename: "again.csv",
      mimeType: "text/csv",
      source: "ui",
      at: "2026-10-09T16:00:00Z",
    });

    expect(restored.id).toBe(first.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.filename).toBe("statement.csv");
    expect(db.select().from(auditLog).all().map((row) => row.action)).toEqual(["create", "delete", "restore"]);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an upload larger than 20 MB returns document_too_large", async () => {
  const dir = mkdtempSync(join(tmpdir(), "num-documents-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const app = createApp(createDb(sqlite), { dataDir: dir });

  try {
    const small = new FormData();
    small.set("file", new File(["ok\n"], "small.csv", { type: "text/csv" }));
    const accepted = await app.request("/api/documents", { method: "POST", body: small });
    expect(accepted.status).toBe(200);

    const large = new FormData();
    large.set("file", new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.csv", { type: "text/csv" }));
    const rejected = await app.request("/api/documents", { method: "POST", body: large });
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({ code: "document_too_large", params: {} });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
