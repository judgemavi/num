import { importBatches } from "@num/db";
import { and, eq, isNull } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { readUnreadable } from "./import-read";
import type { WriteTx } from "./write";

function unreadableParts(itemKey: string): { batchId: string; line: number } | null {
  const prefix = "import_unreadable:";
  if (!itemKey.startsWith(prefix)) {
    return null;
  }
  const rest = itemKey.slice(prefix.length);
  const split = rest.lastIndexOf(":");
  if (split <= 0) {
    return null;
  }
  const line = Number(rest.slice(split + 1));
  if (!Number.isInteger(line) || line < 0) {
    return null;
  }
  return { batchId: rest.slice(0, split), line };
}

/** Marks an unreadable import line as handled by hand. Runs in the write that adds the transaction. */
export function clearUnreadableLine(tx: WriteTx, itemKey: string): void {
  const parts = unreadableParts(itemKey);
  const batch = parts
    ? tx
        .select()
        .from(importBatches)
        .where(and(eq(importBatches.id, parts.batchId), isNull(importBatches.undoneAt)))
        .get()
    : undefined;
  if (!parts || !batch) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const rows = readUnreadable(batch.unreadableJson);
  const next = rows.filter((row) => row.line !== parts.line);
  if (next.length === rows.length) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const after = JSON.stringify(next);
  tx.update(importBatches).set({ unreadableJson: after }).where(eq(importBatches.id, batch.id)).run();
  tx.audit({
    entity: "import_batches",
    entityId: batch.id,
    action: "update",
    before: { unreadableJson: batch.unreadableJson },
    after: { unreadableJson: after },
  });
}
