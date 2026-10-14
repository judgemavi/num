import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documents, type DocumentRow } from "@num/db";
import { utcNow, type Document } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { withoutId, write, type WriteInput } from "./write";

export type DocumentFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

function cleanFilename(value: string) {
  const base = value.split(/[/\\]/).pop()?.replace(/[\r\n"]/g, "").trim() ?? "";
  return base.length > 0 ? base : "upload";
}

function cleanMimeType(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : "application/octet-stream";
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function storedFile(dataDir: string, hash: string) {
  return join(dataDir, "uploads", hash);
}

function isHashConflict(error: unknown) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = error instanceof Error ? error.message : "";
  return `${message} ${cause}`.includes("documents.hash");
}

function findByHash(db: Db, hash: string): DocumentRow | undefined {
  return db.select().from(documents).where(eq(documents.hash, hash)).get();
}

export function restoreDocument(db: Db, id: string, input: WriteInput): Document {
  const row = db.select().from(documents).where(eq(documents.id, id)).get();
  if (!row) {
    throw new ServiceError("document_not_found", 404);
  }
  return restoreStoredDocument(db, row, input);
}

function restoreStoredDocument(db: Db, row: DocumentRow, input: WriteInput) {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const current = tx.select().from(documents).where(eq(documents.id, row.id)).get();
    if (!current) {
      throw new ServiceError("document_not_found", 404);
    }
    if (current.deletedAt) {
      tx.update(documents).set({ deletedAt: null }).where(eq(documents.id, current.id)).run();
    }
    const restored = { ...current, deletedAt: null };
    tx.audit({
      entity: "documents",
      entityId: current.id,
      action: "restore",
      before: withoutId(current),
      after: withoutId(restored),
    });
    return restored;
  });
}

function sameDocument(db: Db, row: DocumentRow, input: WriteInput) {
  if (row.deletedAt) {
    return restoreStoredDocument(db, row, input);
  }
  return row;
}

export function uploadDocument(
  db: Db,
  dataDir: string,
  input: WriteInput & { bytes: Uint8Array; filename: string; mimeType: string },
): Document {
  const hash = sha256(input.bytes);
  const existing = findByHash(db, hash);
  if (existing) {
    return sameDocument(db, existing, input);
  }

  const row: DocumentRow = {
    id: crypto.randomUUID(),
    filename: cleanFilename(input.filename),
    hash,
    mimeType: cleanMimeType(input.mimeType),
    storagePath: `uploads/${hash}`,
    uploadedAt: input.at ?? utcNow(),
    deletedAt: null,
  };

  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  writeFileSync(storedFile(dataDir, hash), input.bytes);

  try {
    write(db, { source: input.source, at: row.uploadedAt }, (tx) => {
      tx.insert(documents).values(row).run();
      tx.audit({
        entity: "documents",
        entityId: row.id,
        action: "create",
        before: null,
        after: withoutId(row),
      });
    });
  } catch (error) {
    const saved = findByHash(db, hash);
    if (saved && isHashConflict(error)) {
      return sameDocument(db, saved, input);
    }
    throw error;
  }

  return row;
}

export function readDocumentFile(db: Db, dataDir: string, id: string): DocumentFile {
  const row = db.select().from(documents).where(eq(documents.id, id)).get();
  if (!row || row.deletedAt) {
    throw new ServiceError("document_not_found", 404);
  }
  return {
    filename: row.filename,
    mimeType: row.mimeType,
    bytes: readFileSync(storedFile(dataDir, row.hash)),
  };
}

export function deleteDocument(db: Db, id: string, input: WriteInput): Document {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(documents).where(eq(documents.id, id)).get();
    if (!existing || existing.deletedAt) {
      throw new ServiceError("document_not_found", 404);
    }
    const deletedAt = at;
    tx.update(documents).set({ deletedAt }).where(eq(documents.id, id)).run();
    const updated = { ...existing, deletedAt };
    tx.audit({
      entity: "documents",
      entityId: id,
      action: "delete",
      before: withoutId(existing),
      after: withoutId(updated),
    });
    return updated;
  });
}
