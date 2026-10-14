import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import type { TransactionReviewListQuery } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { listNeedsReview } from "./needs-review";
import { listReviewTransactions } from "./transaction-list";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };
const asOf = "2026-04-02";

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-review-sort-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  try {
    run(db);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function account(db: Db, name: string) {
  return createAccount(db, { name, kind: "chequing", openingDate: "2026-01-01", openingBalance: 500_000, ...saved });
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId?: string) {
  return createTransaction(db, { accountId, date, amount, payeeRaw: payee, lines: [{ amount, categoryId }], ...saved });
}

/** A row with an automatic label and its score: a Sure row. */
function sure(db: Db, accountId: string, date: string, categoryId: string, score: number) {
  const row = pay(db, accountId, date, -4000, "Cafe", categoryId);
  db.update(transactions).set({ autoReason: "learned_amount", autoConfidence: score, autoSourceId: row.id }).where(eq(transactions.id, row.id)).run();
  return row.id;
}

/** One row of each level, two questions, two rows with no suggestion and two Sure rows with different scores. */
function sample(db: Db) {
  const cash = account(db, "Cash");
  const savings = account(db, "Savings");
  const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
  const other = createCategory(db, { name: "Other", kind: "expense", ...saved });
  pay(db, cash.id, "2026-03-01", -20_000, "Market", food.id);
  const likely = pay(db, cash.id, "2026-03-02", -20_000, "Market");
  const maybe = createTransaction(db, {
    accountId: cash.id,
    date: "2026-03-03",
    amount: -20_000,
    payeeRaw: "Market",
    lines: [{ amount: -10_000, categoryId: other.id }, { amount: -10_000 }],
    ...saved,
  });
  const out = pay(db, cash.id, "2026-03-05", -500_000, "Move");
  const into = pay(db, savings.id, "2026-03-06", 500_000, "Move");
  db.update(transactions).set({ source: "import" }).where(eq(transactions.id, out.id)).run();
  const noneOld = pay(db, cash.id, "2026-03-10", -12_340, "Kiosk north");
  const noneNew = pay(db, cash.id, "2026-03-11", -43_210, "Lamp shop");
  const sureHigh = sure(db, cash.id, "2026-03-07", food.id, 900);
  const sureLow = sure(db, cash.id, "2026-03-08", food.id, 700);
  const hits = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review]));
  expect(hits.get(likely.id)?.level).toBe("likely");
  expect(hits.get(maybe.id)?.level).toBe("maybe");
  expect(hits.get(out.id)?.question).toBe("transfer_pair");
  expect(hits.get(into.id)?.question).toBe("transfer_pair");
  expect(hits.get(noneOld.id)?.level).toBe("none");
  expect(hits.get(noneNew.id)?.level).toBe("none");
  return [noneNew.id, noneOld.id, into.id, out.id, maybe.id, likely.id, sureLow, sureHigh];
}

/** All the rows of the review read, two pages of four rows. */
function readAll(db: Db, dir: TransactionReviewListQuery["dir"]) {
  const read = (page: number) =>
    listReviewTransactions(db, { page, pageSize: 4, uncategorized: false, automatic: false, sort: "confidence", dir, asOf });
  const first = read(1);
  expect(first.total).toBe(8);
  return [...first.items, ...read(2).items].map((row) => row.id);
}

test("the review read sorts by confidence: the level first, then the score, then the newest date", () => {
  withBook((db) => {
    const [noneNew, noneOld, into, out, maybe, likely, sureLow, sureHigh] = sample(db);
    expect(readAll(db, "asc")).toEqual([noneNew, noneOld, into, out, maybe, likely, sureLow, sureHigh]);
    expect(readAll(db, undefined)).toEqual([noneNew, noneOld, into, out, maybe, likely, sureLow, sureHigh]);
    expect(readAll(db, "desc")).toEqual([sureHigh, sureLow, likely, maybe, into, out, noneNew, noneOld]);
  });
});
