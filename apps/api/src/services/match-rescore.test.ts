import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings, transactionLines, transactions } from "@num/db";
import type { AutoReason } from "@num/shared";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { loadMatchBook, scorePayee } from "./match-book";
import { createMerchant } from "./merchants";
import { listNeedsReview } from "./needs-review";
import { createTransaction, getTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-08T16:00:00.000Z" };
const payee = "SEND E-TFR";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-rescore-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, { name: "Everyday", institution: null, kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const rent = createCategory(db, { name: "Rent", kind: "expense", ...saved });
  const misc = createCategory(db, { name: "Miscellaneous", kind: "expense", ...saved });
  const merchant = createMerchant(db, { name: "Landlord", ...saved });
  const confirm = (date: string, amount: number, categoryId: string) =>
    createTransaction(db, { accountId: account.id, date, amount, payeeRaw: payee, status: "open", lines: [{ amount, categoryId }], ...saved });
  /** A row that the app labelled before. */
  const automatic = (date: string, amount: number, categoryId: string, autoReason: AutoReason) => {
    const row = createTransaction(db, {
      accountId: account.id,
      date,
      amount,
      payeeRaw: payee,
      merchantId: merchant.id,
      status: "open",
      lines: [{ amount }],
      ...saved,
    });
    db.update(transactions).set({ source: "import", autoReason, autoSourceId: "old", autoConfidence: 864 }).where(eq(transactions.id, row.id)).run();
    db.update(transactionLines).set({ categoryId }).where(eq(transactionLines.transactionId, row.id)).run();
    return row.id;
  };
  const read = (id: string) => {
    const row = getTransaction(db, id);
    return {
      categoryId: row?.lines[0]?.categoryId ?? null,
      merchantId: row?.merchantId ?? null,
      autoReason: row?.autoReason ?? null,
      autoSourceId: row?.autoSourceId ?? null,
      autoConfidence: row?.autoConfidence ?? null,
    };
  };
  const labelAudits = (id: string) =>
    db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "label"))).all().length;
  return {
    db,
    rent,
    misc,
    merchant,
    confirm,
    automatic,
    read,
    labelAudits,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("after a confirmation, an automatic row outside all bands goes back to uncategorized with its merchant", () => {
  const sample = book();
  try {
    sample.confirm("2026-01-01", -2550000, sample.rent.id);
    sample.confirm("2026-02-01", -2550000, sample.rent.id);
    const ids = [-15000, -1500000, -2000000].map((amount) => sample.automatic("2026-02-10", amount, sample.rent.id, "learned_payee"));
    sample.confirm("2026-03-01", -2550000, sample.rent.id);
    const hits = listNeedsReview(sample.db, "2026-04-01");
    for (const id of ids) {
      expect(sample.read(id)).toEqual({
        categoryId: null,
        merchantId: sample.merchant.id,
        autoReason: null,
        autoSourceId: null,
        autoConfidence: null,
      });
      expect(sample.labelAudits(id)).toBe(1);
      const review = hits.find((hit) => hit.id === id)?.review;
      expect(review?.level).toBe("likely");
      expect(review?.suggestion?.categoryId).toBe(sample.rent.id);
    }
  } finally {
    sample.close();
  }
});

test("an automatic row that still qualifies keeps its label with the new values", () => {
  const sample = book();
  try {
    sample.confirm("2026-01-01", -2550000, sample.rent.id);
    const id = sample.automatic("2026-01-10", -2550000, sample.rent.id, "learned_payee");
    const latest = sample.confirm("2026-02-01", -2550000, sample.rent.id);
    const expected = scorePayee(loadMatchBook(sample.db), { payee, amount: -2550000, recurring: null });
    expect(expected.level).toBe("automatic");
    expect(sample.read(id)).toEqual({
      categoryId: sample.rent.id,
      merchantId: sample.merchant.id,
      autoReason: "learned_amount",
      autoSourceId: latest.id,
      autoConfidence: expected.confidenceMilli,
    });
    expect(sample.labelAudits(id)).toBe(1);
  } finally {
    sample.close();
  }
});

test("an automatic row that now qualifies for another label gets that label", () => {
  const sample = book();
  try {
    sample.confirm("2026-01-01", -2550000, sample.rent.id);
    sample.confirm("2026-02-01", -2550000, sample.rent.id);
    const id = sample.automatic("2026-02-10", -40000, sample.rent.id, "learned_payee");
    const misc = sample.confirm("2026-03-01", -40000, sample.misc.id);
    expect(sample.read(id)).toEqual({
      categoryId: sample.misc.id,
      merchantId: sample.merchant.id,
      autoReason: "learned_amount",
      autoSourceId: misc.id,
      autoConfidence: 850,
    });
    expect(sample.labelAudits(id)).toBe(1);
  } finally {
    sample.close();
  }
});

test("a confirmed row never changes", () => {
  const sample = book();
  try {
    const own = sample.confirm("2026-01-01", -2550000, sample.misc.id);
    sample.confirm("2026-02-01", -2550000, sample.rent.id);
    sample.confirm("2026-03-01", -2550000, sample.rent.id);
    sample.confirm("2026-04-01", -2550000, sample.rent.id);
    expect(sample.read(own.id)).toEqual({ categoryId: sample.misc.id, merchantId: null, autoReason: null, autoSourceId: null, autoConfidence: null });
    expect(sample.labelAudits(own.id)).toBe(0);
  } finally {
    sample.close();
  }
});

test("a recurring, refund or transfer automatic row never changes", () => {
  const sample = book();
  try {
    sample.confirm("2026-01-01", -2550000, sample.rent.id);
    const reasons: AutoReason[] = ["recurring", "refund_match", "refund_reversal", "transfer_match"];
    const ids = reasons.map((reason) => sample.automatic("2026-01-10", -15000, sample.rent.id, reason));
    sample.confirm("2026-02-01", -2550000, sample.rent.id);
    ids.forEach((id, index) => {
      expect(sample.read(id)).toEqual({
        categoryId: sample.rent.id,
        merchantId: sample.merchant.id,
        autoReason: reasons[index] ?? null,
        autoSourceId: "old",
        autoConfidence: 864,
      });
      expect(sample.labelAudits(id)).toBe(0);
    });
  } finally {
    sample.close();
  }
});
