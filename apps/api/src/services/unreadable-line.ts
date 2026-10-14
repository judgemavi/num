import { importBatches } from "@num/db";
import { and, eq, isNull } from "drizzle-orm";
import { ServiceError } from "../service-error";
import type { WriteTx } from "./write";

function unreadableParts(itemKey: string) {
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
  const next = batch.unreadableJson.filter((row) => row.line !== parts.line);
  if (next.length === batch.unreadableJson.length) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  tx.update(importBatches).set({ unreadableJson: next }).where(eq(importBatches.id, batch.id)).run();
  // The audit log keeps the lines as JSON text, the same text that the column stores.
  tx.audit({
    entity: "import_batches",
    entityId: batch.id,
    action: "update",
    before: { unreadableJson: JSON.stringify(batch.unreadableJson) },
    after: { unreadableJson: JSON.stringify(next) },
  });
}
