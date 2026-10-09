import { settings } from "@num/db";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { write, type AuditSource } from "./write";

export function aiCanWrite(db: Db): boolean {
  const row = db.select().from(settings).where(eq(settings.key, "aiCanWrite")).get();
  return row?.value === "true";
}

export function changeAiAccess(
  db: Db,
  input: { aiCanWrite: boolean; source: AuditSource; at?: string },
): { aiCanWrite: boolean } {
  const ready = db.select().from(settings).where(eq(settings.key, "currency")).get();
  if (!ready) {
    throw new ServiceError("setup_required", 409);
  }
  const next = input.aiCanWrite ? "true" : "false";
  const current = db.select().from(settings).where(eq(settings.key, "aiCanWrite")).get();
  if (current?.value === next) {
    return { aiCanWrite: input.aiCanWrite };
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    const existing = tx.select().from(settings).where(eq(settings.key, "aiCanWrite")).get();
    if (!existing) {
      tx.insert(settings).values({ key: "aiCanWrite", value: next }).run();
      tx.audit({
        entity: "settings",
        entityId: "aiCanWrite",
        action: "create",
        before: null,
        after: { value: next },
      });
      return;
    }
    tx.update(settings).set({ value: next }).where(eq(settings.key, "aiCanWrite")).run();
    tx.audit({
      entity: "settings",
      entityId: "aiCanWrite",
      action: "update",
      before: { value: existing.value },
      after: { value: next },
    });
  });
  return { aiCanWrite: input.aiCanWrite };
}
