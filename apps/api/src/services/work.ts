import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "bun:sqlite";
import type { Db } from "../db";
import type { AuditSource } from "./write";

type WorkState = {
  sqlite: Database;
  depth: number;
  open: boolean;
  auditSource?: AuditSource;
  deferUploads: boolean;
  mcpRead: boolean;
};

const work = new AsyncLocalStorage<WorkState>();

function sqliteOf(db: Db): Database {
  const client = (db as { $client?: Database }).$client;
  if (!client) {
    throw new Error("Database client is missing");
  }
  return client;
}

export function currentAuditSource(): AuditSource | undefined {
  return work.getStore()?.auditSource;
}

export function uploadsDeferred(): boolean {
  return work.getStore()?.deferUploads === true;
}

export function isMcpRead(): boolean {
  return work.getStore()?.mcpRead === true;
}

export function inUnit<T>(db: Db, run: (tx: Db) => T): T {
  const state = work.getStore();
  if (!state?.open) {
    return db.transaction((tx) => run(tx));
  }
  const name = `sp${state.depth}`;
  state.depth += 1;
  state.sqlite.exec(`SAVEPOINT ${name}`);
  try {
    const result = run(db);
    state.sqlite.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    try {
      state.sqlite.exec(`ROLLBACK TO ${name}`);
      state.sqlite.exec(`RELEASE ${name}`);
    } catch {
      // Keep the original error. The outer transaction still rolls back.
    }
    throw error;
  } finally {
    state.depth -= 1;
  }
}

export async function withRead<T>(run: () => Promise<T>): Promise<T> {
  const state: WorkState = {
    sqlite: null as unknown as Database,
    depth: 0,
    open: false,
    deferUploads: false,
    mcpRead: true,
  };
  return work.run(state, run);
}

export async function withTransaction<T>(
  db: Db,
  options: { auditSource: AuditSource; deferUploads: boolean },
  run: () => Promise<{ commit: boolean; value: T }>,
): Promise<T> {
  const sqlite = sqliteOf(db);
  const state: WorkState = {
    sqlite,
    depth: 0,
    open: true,
    auditSource: options.auditSource,
    deferUploads: options.deferUploads,
    mcpRead: false,
  };
  sqlite.exec("BEGIN");
  try {
    const outcome = await work.run(state, run);
    sqlite.exec(outcome.commit ? "COMMIT" : "ROLLBACK");
    return outcome.value;
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    throw error;
  }
}
