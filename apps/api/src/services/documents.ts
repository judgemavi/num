import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

/** The stored file of a document. The hash is unique, thus one file belongs to one document. */
export function storedFile(dataDir: string, hash: string) {
  return join(dataDir, "uploads", hash);
}

export function writeStoredFile(dataDir: string, hash: string, bytes: Uint8Array): void {
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  writeFileSync(storedFile(dataDir, hash), bytes);
}

/**
 * The same file again after its document was erased (decision 0041): the file is stored again and the document
 * loses its erased mark. The file is written first. If the write of the row fails, the file is removed again.
 */
export function restoreDocument(db: Db, dataDir: string, row: DocumentRow, bytes: Uint8Array, input: WriteInput): Document {
  writeStoredFile(dataDir, row.hash, bytes);
  try {
    return write(db, { source: input.source, at: input.at ?? utcNow() }, (tx) => {
      const current = tx.select().from(documents).where(eq(documents.id, row.id)).get();
      if (!current) {
        throw new ServiceError("document_not_found", 404);
      }
      const restored = { ...current, deletedAt: null };
      tx.update(documents).set({ deletedAt: null }).where(eq(documents.id, current.id)).run();
      tx.audit({ entity: "documents", entityId: current.id, action: "restore", before: withoutId(current), after: withoutId(restored) });
      return restored;
    });
  } catch (error) {
    rmSync(storedFile(dataDir, row.hash), { force: true });
    throw error;
  }
}

export function readDocumentFile(db: Db, dataDir: string, id: string): DocumentFile {
  const row = db.select().from(documents).where(eq(documents.id, id)).get();
  const path = row ? storedFile(dataDir, row.hash) : null;
  if (!row || row.deletedAt || !path || !existsSync(path)) {
    throw new ServiceError("document_not_found", 404);
  }
  return {
    filename: row.filename,
    mimeType: row.mimeType,
    bytes: readFileSync(path),
  };
}

/**
 * Erase the file of a document (decision 0041). The row stays with its filename, hash and upload time, and gets the
 * erased mark `deletedAt`. The import batch and its transactions stay.
 *
 * The file moves to a side name inside the database transaction. If the transaction fails, the file moves back. After
 * the commit, the side file is deleted. Thus the row and the file under its hash always agree.
 */
export function eraseDocument(db: Db, dataDir: string, id: string, input: WriteInput): Document {
  const at = input.at ?? utcNow();
  // The stored file that the transaction moved to its side name. Empty when there was no file.
  const moved: string[] = [];
  let erased: Document;
  try {
    erased = write(db, { source: input.source, at }, (tx) => {
      const existing = tx.select().from(documents).where(eq(documents.id, id)).get();
      if (!existing || existing.deletedAt) {
        throw new ServiceError("document_not_found", 404);
      }
      const updated = { ...existing, deletedAt: at };
      tx.update(documents).set({ deletedAt: at }).where(eq(documents.id, id)).run();
      tx.audit({ entity: "documents", entityId: id, action: "delete", before: withoutId(existing), after: withoutId(updated) });
      const file = storedFile(dataDir, existing.hash);
      if (existsSync(file)) {
        renameSync(file, sideName(file));
        moved.push(file);
      }
      return updated;
    });
  } catch (error) {
    for (const file of moved) {
      renameSync(sideName(file), file);
    }
    throw error;
  }
  for (const file of moved) {
    rmSync(sideName(file), { force: true });
  }
  return erased;
}

function sideName(file: string) {
  return `${file}.erased`;
}
