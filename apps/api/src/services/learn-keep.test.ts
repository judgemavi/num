import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, inboxDecisions, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { keepKey } from "./decision-keep";
import { importStatement } from "./imports";
import { decideInboxItem } from "./inbox-decisions";
import { loadMatchBook, scorePayee } from "./match-book";
import { listNeedsReview } from "./needs-review";
import { approveSelected } from "./review-approve";
import { acceptLooksRight, createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-10-01";
const payee = "E-TRANSFER";

const columnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-learn-keep-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, { asOf: "2026-10-07", name: "Everyday", institution: null, kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const rental = createCategory(db, { name: "Rental Income", kind: "income", ...saved });
  const other = createCategory(db, { name: "Other income", kind: "income", ...saved });
  const groceries = createCategory(db, { name: "Groceries", kind: "expense", ...saved });
  const confirm = (date: string, amount: number, categoryId: string, payeeRaw = payee) =>
    createTransaction(db, { accountId: account.id, date, amount, payeeRaw, lines: [{ amount, categoryId }], ...saved }).id;
  const open = (date: string, amount: number, payeeRaw = payee) =>
    createTransaction(db, { accountId: account.id, date, amount, payeeRaw, lines: [{ amount }], ...saved }).id;
  /** The user saves the uncategorized row with no category. */
  const keep = (date: string, amount: number, payeeRaw = payee) => {
    const id = open(date, amount, payeeRaw);
    updateTransaction(db, id, { lines: [{ amount }], keepUncategorized: true, ...saved });
    return id;
  };
  const read = (id: string) => {
    const row = getTransaction(db, id);
    return {
      categoryId: row?.lines[0]?.categoryId ?? null,
      autoReason: row?.autoReason ?? null,
      autoSourceId: row?.autoSourceId ?? null,
      autoConfidence: row?.autoConfidence ?? null,
    };
  };
  const kept = (id: string) => db.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, keepKey(id))).get() !== undefined;
  const score = (amount: number, normalized = payee) => scorePayee(loadMatchBook(db), { payee: normalized, amount, recurring: null });
  const hit = (id: string) => listNeedsReview(db, asOf).find((item) => item.id === id);
  const importRows = (lines: string[]) =>
    importStatement(db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: account.id,
      filename: "statement.csv",
      bytes: new TextEncoder().encode(["date,description,amount", ...lines].join("\n")),
      columnMap,
    });
  return {
    db,
    rental,
    other,
    groceries,
    confirm,
    open,
    keep,
    read,
    kept,
    score,
    hit,
    importRows,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a kept row teaches no category and a row without the decision does not", () => {
  const sample = book();
  try {
    sample.open("2026-05-01", 40_000);
    expect(sample.score(40_000).level).toBe("none");
    const kept = sample.keep("2026-05-02", 40_000);
    const result = sample.score(40_000);
    expect(result).toMatchObject({ level: "automatic", keep: true, categoryId: null, transferAccountId: null, sourceId: kept });
    expect(result.confidenceMilli).toBe(850);
  } finally {
    sample.close();
  }
});

test("an imported 40 in only the no category band is automatic no category and stays uncategorized", () => {
  const sample = book();
  try {
    for (const date of ["2026-05-01", "2026-06-01", "2026-07-01"]) {
      sample.confirm(date, 2_000_000, sample.rental.id);
    }
    const kept = sample.keep("2026-07-15", 40_000);
    sample.importRows(["08/02/2026,E-TRANSFER,40.00"]);
    const row = sample.db.select().from(transactions).where(eq(transactions.source, "import")).get();
    expect(row).toBeDefined();
    const id = row?.id ?? "";
    expect(sample.read(id)).toEqual({ categoryId: null, autoReason: "learned_amount", autoSourceId: kept, autoConfidence: 850 });
    const review = sample.hit(id)?.review;
    expect(review?.level).toBe("sure");
    expect(review?.suggestion).toBeNull();
  } finally {
    sample.close();
  }
});

test("Looks right on an automatic no category records the keep and clears the automatic fields", () => {
  const sample = book();
  try {
    const later = sample.open("2026-05-10", 40_000);
    sample.keep("2026-05-01", 40_000);
    expect(sample.read(later)).toMatchObject({ categoryId: null, autoReason: "learned_amount" });
    acceptLooksRight(sample.db, later, saved);
    expect(sample.read(later)).toEqual({ categoryId: null, autoReason: null, autoSourceId: null, autoConfidence: null });
    expect(sample.kept(later)).toBe(true);
    expect(sample.hit(later)).toBeUndefined();
    const audits = sample.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "inbox_decisions"), eq(auditLog.entityId, keepKey(later))))
      .all();
    expect(audits.map((entry) => entry.action)).toEqual(["create"]);
  } finally {
    sample.close();
  }
});

test("Approve records the keep of each automatic no category", () => {
  const sample = book();
  try {
    const first = sample.open("2026-05-10", 40_000);
    const second = sample.open("2026-05-11", 40_000);
    sample.keep("2026-05-01", 40_000);
    approveSelected(sample.db, asOf, [first, second], saved);
    for (const id of [first, second]) {
      expect(sample.read(id)).toEqual({ categoryId: null, autoReason: null, autoSourceId: null, autoConfidence: null });
      expect(sample.kept(id)).toBe(true);
    }
    expect(listNeedsReview(sample.db, asOf)).toHaveLength(0);
  } finally {
    sample.close();
  }
});

test("a no category suggestion has the keep item key, and Yes records the keep", () => {
  const sample = book();
  try {
    sample.keep("2026-05-01", 40_000);
    const yes = sample.open("2026-05-10", 41_000);
    const review = sample.hit(yes)?.review;
    expect(review?.level).toBe("likely");
    expect(review?.suggestion).toMatchObject({ keep: true, categoryId: null, transferAccountId: null });
    expect(review?.itemKey).toBe(keepKey(yes));
    decideInboxItem(sample.db, asOf, keepKey(yes), "keep_uncategorized", saved);
    expect(sample.kept(yes)).toBe(true);
    expect(sample.hit(yes)).toBeUndefined();
  } finally {
    sample.close();
  }
});

test("Approve of a suggestion records the keep of a no category suggestion", () => {
  const sample = book();
  try {
    sample.keep("2026-05-01", 40_000);
    const bulk = sample.open("2026-05-11", 41_000);
    approveSelected(sample.db, asOf, [bulk], saved);
    expect(sample.kept(bulk)).toBe(true);
    expect(sample.read(bulk)).toEqual({ categoryId: null, autoReason: null, autoSourceId: null, autoConfidence: null });
    expect(sample.hit(bulk)).toBeUndefined();
  } finally {
    sample.close();
  }
});

test("Rental Income and no category turn on the guard for an amount near the band", () => {
  const sample = book();
  try {
    for (const date of ["2026-05-01", "2026-06-01", "2026-07-01"]) {
      sample.confirm(date, 2_000_000, sample.rental.id);
    }
    expect(sample.score(1_800_000)).toMatchObject({ level: "automatic", categoryId: sample.rental.id });
    sample.keep("2026-04-01", 40_000);
    expect(sample.score(1_800_000)).toMatchObject({ level: "suggestion", categoryId: sample.rental.id });
  } finally {
    sample.close();
  }
});

test("a later confirmation scores an automatic no category again", () => {
  const sample = book();
  try {
    const later = sample.open("2026-05-10", 40_000);
    const first = sample.keep("2026-05-01", 40_000);
    expect(sample.read(later)).toEqual({ categoryId: null, autoReason: "learned_amount", autoSourceId: first, autoConfidence: 850 });
    const second = sample.keep("2026-05-05", 40_000);
    const same = sample.score(40_000);
    // Two kept rows teach. The automatic row does not teach until the user confirms it.
    expect(same.confidenceMilli).toBe(910);
    expect(sample.read(later)).toEqual({ categoryId: null, autoReason: "learned_amount", autoSourceId: second, autoConfidence: same.confidenceMilli });
    sample.confirm("2026-06-01", 40_000, sample.other.id);
    sample.confirm("2026-06-02", 40_000, sample.other.id);
    expect(sample.read(later)).toEqual({ categoryId: null, autoReason: null, autoSourceId: null, autoConfidence: null });
    sample.confirm("2026-06-03", 40_000, sample.other.id);
    sample.confirm("2026-06-04", 40_000, sample.other.id);
    expect(sample.read(later)).toMatchObject({ categoryId: sample.other.id, autoReason: "learned_amount" });
  } finally {
    sample.close();
  }
});

test("the similar payee and brand family signals ignore no category labels", () => {
  const sample = book();
  try {
    sample.keep("2026-05-01", -40_000, "EXAMPLEMART WHOLESALE");
    expect(sample.score(-40_000, "EXAMPLEMART WHOLESALE W909 EXAMPLEVILLE").level).toBe("none");
    sample.keep("2026-05-01", -4_000, "DEMOFARE NORTH STN");
    sample.keep("2026-05-02", -4_000, "DEMOFARE WEST STN");
    expect(sample.score(-4_000, "DEMOFARE EAST STN").level).toBe("none");
    sample.confirm("2026-05-03", -50_000, sample.groceries.id, "EXAMPLEMART");
    const own = sample.score(-40_000, "EXAMPLEMART WHOLESALE");
    expect(own).toMatchObject({ keep: true, reason: "learned_amount" });
    expect(own.signals.every((signal) => signal.reason !== "similar")).toBe(true);
  } finally {
    sample.close();
  }
});
