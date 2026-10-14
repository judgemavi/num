import { AsyncLocalStorage } from "node:async_hooks";
import { auditLog, auditSources } from "@num/db";
import { isUtcTimestamp, utcNow } from "@num/shared";
import type { Db } from "../db";
import { dropSettledKeeps } from "./decision-keep";

function jsonText(value: unknown) {
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

export type WriteInput = {
  source: AuditSource;
  at?: string;
};

export type Reader = Db | WriteTx;

/** The audit log keeps a row without its id. The id is in `entityId`. */
export function withoutId<T extends { id: string }>({ id, ...rest }: T) {
  return rest;
}

/** A field that an update leaves out keeps its stored value. An explicit null clears it. */
export function keepOmitted<T>(next: T | undefined, stored: T) {
  return next === undefined ? stored : next;
}

const auditSourceOverride = new AsyncLocalStorage<AuditSource>();

export function currentAuditSource(): AuditSource | undefined {
  return auditSourceOverride.getStore();
}

export function withMcpAudit<T>(run: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(auditSourceOverride.run("mcp", run));
}

export function write<T>(db: Db, options: WriteInput, run: (tx: WriteTx) => T): T {
  const at = options.at ?? utcNow();
  if (!isUtcTimestamp(at)) {
    throw new Error("Audit time must be a UTC timestamp");
  }
  const source = currentAuditSource() ?? options.source;

  return db.transaction((tx) => {
    const entries: AuditEntry[] = [];
    const audited: WriteTx = Object.assign(tx, {
      audit(entry: AuditEntry) {
        entries.push(entry);
      },
    });
    const result = run(audited);
    dropSettledKeeps(audited);
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
