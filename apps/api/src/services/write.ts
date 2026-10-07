import { auditLog, auditSources } from "@num/db";
import { isUtcTimestamp, utcNow } from "@num/shared";
import type { Db } from "../db";

function jsonText(value: unknown): string | null {
  if (value === undefined) {
    throw new Error("Audit value must be JSON or null");
  }
  if (value === null) {
    return null;
  }
  const text = JSON.stringify(value);
  if (text === undefined) {
    throw new Error("Audit value must be JSON or null");
  }
  return text;
}

export type AuditSource = (typeof auditSources)[number];

export type AuditEntry = {
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
};

type SqliteTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type WriteTx = SqliteTx & {
  audit(entry: AuditEntry): void;
};

export function write<T>(
  db: Db,
  options: { source: AuditSource; at?: string },
  run: (tx: WriteTx) => T,
): T {
  const at = options.at ?? utcNow();
  if (!isUtcTimestamp(at)) {
    throw new Error("Audit time must be a UTC timestamp");
  }

  return db.transaction((tx) => {
    const entries: AuditEntry[] = [];
    const audited: WriteTx = Object.assign(tx, {
      audit(entry: AuditEntry) {
        entries.push(entry);
      },
    });
    const result = run(audited);
    if (entries.length === 0) {
      throw new Error("A write must record an audit entry");
    }
    for (const entry of entries) {
      tx.insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          before: jsonText(entry.before),
          after: jsonText(entry.after),
          source: options.source,
          at,
        })
        .run();
    }
    return result;
  });
}
