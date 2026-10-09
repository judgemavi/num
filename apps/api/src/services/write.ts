import { auditLog, auditSources } from "@num/db";
import { isUtcTimestamp, utcNow } from "@num/shared";
import type { Db } from "../db";
import { currentAuditSource, inUnit } from "./work";

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

function auditedDb(tx: Db, entries: AuditEntry[]): WriteTx {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === "audit") {
        return (entry: AuditEntry) => {
          entries.push(entry);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as WriteTx;
}

export function write<T>(
  db: Db,
  options: { source: AuditSource; at?: string },
  run: (tx: WriteTx) => T,
): T {
  const at = options.at ?? utcNow();
  if (!isUtcTimestamp(at)) {
    throw new Error("Audit time must be a UTC timestamp");
  }
  const source = currentAuditSource() ?? options.source;

  return inUnit(db, (tx) => {
    const entries: AuditEntry[] = [];
    const audited = (
      tx === db
        ? auditedDb(tx, entries)
        : Object.assign(tx, {
            audit(entry: AuditEntry) {
              entries.push(entry);
            },
          })
    ) as WriteTx;
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
          source,
          at,
        })
        .run();
    }
    return result;
  });
}
