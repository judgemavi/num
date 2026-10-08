import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { uploadDocument } from "./documents";

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
