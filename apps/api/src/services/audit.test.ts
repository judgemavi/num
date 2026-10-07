import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { Temporal } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { write } from "./write";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-audit-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const at = "2026-10-07T16:00:00Z";

test("a write creates one audit row with before and after", () => {
  const db = tempDatabase();
  try {
    write(db.db, { source: "ui", at }, (tx) => {
      tx.insert(settings).values({ key: "currency", value: "JPY" }).run();
      tx.audit({
        entity: "settings",
        entityId: "currency",
        action: "update",
        before: { value: "CAD" },
        after: { value: "JPY" },
      });
    });

    const rows = db.sqlite
      .query("select entity, entity_id, action, before, after, source, at from audit_log")
      .all();
    expect(rows).toEqual([
      {
        entity: "settings",
        entity_id: "currency",
        action: "update",
        before: '{"value":"CAD"}',
        after: '{"value":"JPY"}',
        source: "ui",
        at,
      },
    ]);
    expect(db.sqlite.query("select key, value from settings").all()).toEqual([
      { key: "currency", value: "JPY" },
    ]);
  } finally {
    db.close();
  }
});

test("a create records the new id and the final state", () => {
  const db = tempDatabase();
  try {
    const id = crypto.randomUUID();
    write(db.db, { source: "ui", at }, (tx) => {
      tx.insert(settings).values({ key: "currency", value: "JPY" }).run();
      tx.audit({
        entity: "settings",
        entityId: id,
        action: "create",
        before: null,
        after: { key: "currency", value: "JPY" },
      });
    });

    const rows = db.sqlite.query("select entity_id, before, after from audit_log").all();
    expect(rows).toEqual([
      {
        entity_id: id,
        before: null,
        after: '{"key":"currency","value":"JPY"}',
      },
    ]);
  } finally {
    db.close();
  }
});

test("one write can record several audit rows", () => {
  const db = tempDatabase();
  try {
    write(db.db, { source: "import", at }, (tx) => {
      tx.audit({
        entity: "transactions",
        entityId: "source",
        action: "update",
        before: { amount: -100 },
        after: { amount: -120 },
      });
      tx.audit({
        entity: "transactions",
        entityId: "mirror",
        action: "update",
        before: { amount: 100 },
        after: { amount: 120 },
      });
    });

    const rows = db.sqlite
      .query("select entity_id, source, at from audit_log order by entity_id")
      .all();
    expect(rows).toEqual([
      { entity_id: "mirror", source: "import", at },
      { entity_id: "source", source: "import", at },
    ]);
  } finally {
    db.close();
  }
});

test("a write with no audit entry fails", () => {
  const db = tempDatabase();
  try {
    expect(() =>
      write(db.db, { source: "ui", at }, (tx) => {
        tx.insert(settings).values({ key: "currency", value: "JPY" }).run();
      }),
    ).toThrow("A write must record an audit entry");
    expect(db.sqlite.query("select id from audit_log").all()).toEqual([]);
    expect(db.sqlite.query("select key from settings").all()).toEqual([]);
  } finally {
    db.close();
  }
});

test("a failed write does not create an audit row", () => {
  const db = tempDatabase();
  try {
    expect(() =>
      write(db.db, { source: "ui", at }, (tx) => {
        tx.insert(settings).values({ key: "currency", value: "JPY" }).run();
        tx.audit({
          entity: "settings",
          entityId: "currency",
          action: "update",
          before: { value: "CAD" },
          after: { value: "JPY" },
        });
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(db.sqlite.query("select id from audit_log").all()).toEqual([]);
    expect(db.sqlite.query("select key from settings").all()).toEqual([]);
  } finally {
    db.close();
  }
});

test("the audit time defaults to the current UTC time", () => {
  const db = tempDatabase();
  try {
    const before = Temporal.Now.instant();
    write(db.db, { source: "ui" }, (tx) => {
      tx.audit({
        entity: "settings",
        entityId: "currency",
        action: "update",
        before: null,
        after: { value: "JPY" },
      });
    });
    const after = Temporal.Now.instant();
    const row = db.sqlite.query("select at from audit_log").get() as { at: string };
    const stored = Temporal.Instant.from(row.at);
    expect(Temporal.Instant.compare(stored, before.subtract({ seconds: 2 })) >= 0).toBe(true);
    expect(Temporal.Instant.compare(stored, after.add({ seconds: 2 })) <= 0).toBe(true);
  } finally {
    db.close();
  }
});

test("an audit time that is not UTC does not write", () => {
  const db = tempDatabase();
  try {
    expect(() =>
      write(
        db.db,
        { source: "ui", at: "2026-10-07T16:00:00" },
        (tx) => {
          tx.audit({
            entity: "settings",
            entityId: "currency",
            action: "update",
            before: null,
            after: { value: "JPY" },
          });
        },
      ),
    ).toThrow("Audit time must be a UTC timestamp");
    expect(db.sqlite.query("select id from audit_log").all()).toEqual([]);
  } finally {
    db.close();
  }
});
