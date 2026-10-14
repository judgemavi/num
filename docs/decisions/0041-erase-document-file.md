# 0041 — Remove the file of a document

Status: accepted (owner, 2026-10-14)

## Context

1. The spec said "Keep documents permanently. Use only a soft delete" (§5.12). A statement file has personal data. The
   owner wants to remove a file that the book does not need, but keep the import and its transactions.
2. The soft delete of a document only set `deletedAt`. The file stayed on the disk and no screen used the delete.
3. `POST /api/documents` stored a file without an import. No screen used it. A file comes in through an import.

## Decision

1. `DELETE /api/documents/{id}` erases the file of a document. The same method as `DELETE /api/transactions/{id}`.
   - The stored file in `uploads/` is deleted.
   - The document row stays with `filename`, `hash`, `mimeType`, `storagePath` and `uploadedAt`. `deletedAt` is the
     time of the erase (the erased mark). The audit log gets a `delete` entry with the row before and after.
   - The import batch and its transactions stay. An erase of an erased document answers 404.
   - `GET /api/documents/{id}` of an erased document answers 404 `document_not_found`.
2. One write, and the disk agrees with the database. In the database transaction, the service marks the row and moves
   the file to a side name (`<hash>.erased`). If the transaction fails, the file moves back. After the commit, the
   service deletes the side file. Thus a row without the erased mark always has its file under its hash. If the delete
   of the side file fails after the commit, the side file stays, but no route serves it.
3. The same file again after an erase: the import stores the file again and clears `deletedAt` (audited `restore`).
   Then the hash rules of §7.2 apply: with an active batch, the import shows that batch; with an undone batch, it
   imports the file again. If the write of the row fails, the stored file is removed again.
4. Remove `POST /api/documents` (upload without an import) and its MCP tool `post_documents`.
5. The UI: "Remove file" in the menu of an import (Imports list and import detail), for an active or an undone import,
   with the shared confirmation "The file is erased. Its N transactions stay." After the erase, the import shows
   "File removed" and has no download link.
6. The import list item gets `documentDeletedAt` and `transactionCount` (the transactions that the rows of the import
   made or matched) for this text.

## Consequences

- Spec changes: §4 (delete convention), §5.12, §7.2 step 1.
- MCP: `post_documents_id_delete` becomes `delete_documents_id`, and `post_documents` goes away.
- Logic tests: the erase keeps the record, the import and the transactions and deletes the file; the same file again
  is stored again for an active batch and for an undone batch.
