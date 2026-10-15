import { buckets } from "@num/db";
import { utcNow, type Bucket } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { categoryIdsFor, readBucket, snapshot } from "./buckets";
import { withoutSortKey } from "./list-sql";
import { scheduleOf } from "./schedules";
import { write, type WriteInput } from "./write";

/**
 * Pause or resume a bucket. A paused bucket keeps its balance, and the fill does not fund it.
 * An income cannot be paused. An archived bucket cannot change.
 */
function setPaused(db: Db, id: string, paused: boolean, input: WriteInput): Bucket {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = withoutSortKey(tx.select().from(buckets).where(eq(buckets.id, id)).get());
    if (!existing) {
      throw new ServiceError("bucket_not_found", 404);
    }
    if (existing.kind === "income") {
      throw new ServiceError("bucket_income_pause", 409);
    }
    if (existing.archivedAt) {
      throw new ServiceError("bucket_archived", 409);
    }
    if (paused === (existing.pausedAt !== null)) {
      throw new ServiceError(paused ? "bucket_paused" : "bucket_not_paused", 409);
    }
    const pausedAt = paused ? at : null;
    tx.update(buckets).set({ pausedAt }).where(eq(buckets.id, id)).run();
    const categoryIds = categoryIdsFor(tx, id);
    const schedule = scheduleOf(tx, id);
    tx.audit({
      entity: "buckets",
      entityId: id,
      action: paused ? "pause" : "resume",
      before: snapshot(existing, categoryIds, schedule),
      after: snapshot({ ...existing, pausedAt }, categoryIds, schedule),
    });
    return readBucket(tx, id);
  });
}

export function pauseBucket(db: Db, id: string, input: WriteInput): Bucket {
  return setPaused(db, id, true, input);
}

export function resumeBucket(db: Db, id: string, input: WriteInput): Bucket {
  return setPaused(db, id, false, input);
}
