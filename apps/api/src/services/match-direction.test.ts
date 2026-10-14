import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { loadMatchBook, scorePayee } from "./match-book";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-08T16:00:00.000Z" };

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-match-direction-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, { name: "Everyday", institution: null, kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const confirm = (payeeRaw: string, date: string, amount: number, line: { categoryId?: string; transferAccountId?: string }) =>
    createTransaction(db, { accountId: account.id, date, amount, payeeRaw, status: "open", lines: [{ amount, ...line }], ...saved });
  return {
    db,
    confirm,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("money in does not learn from money out", () => {
  const sample = book();
  try {
    const shopping = createCategory(sample.db, { name: "Shopping", kind: "expense", ...saved });
    for (const date of ["2026-01-05", "2026-02-05", "2026-03-05"]) {
      sample.confirm("ACME STORE", date, -50000, { categoryId: shopping.id });
    }
    const loaded = loadMatchBook(sample.db);
    expect(scorePayee(loaded, { payee: "ACME STORE", amount: -50000, recurring: null }).categoryId).toBe(shopping.id);
    const incoming = scorePayee(loaded, { payee: "ACME STORE", amount: 50000, recurring: null });
    expect(incoming.level).toBe("none");
    expect(incoming.categoryId).toBeNull();
    expect(scorePayee(loaded, { payee: "ACME STORE ONLINE", amount: 50000, recurring: null }).level).toBe("none");
    expect(scorePayee(loaded, { payee: "ACME", amount: 0, recurring: null }).level).toBe("none");
  } finally {
    sample.close();
  }
});

test("a learned transfer ignores the direction", () => {
  const sample = book();
  try {
    const savings = createAccount(sample.db, { name: "Savings", institution: null, kind: "savings", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    sample.confirm("ONLINE TRANSFER", "2026-03-01", -800000, { transferAccountId: savings.id });
    const loaded = loadMatchBook(sample.db);
    expect(scorePayee(loaded, { payee: "ONLINE TRANSFER", amount: -800000, recurring: null }).transferAccountId).toBe(savings.id);
    expect(scorePayee(loaded, { payee: "ONLINE TRANSFER", amount: 250000, recurring: null }).transferAccountId).toBe(savings.id);
  } finally {
    sample.close();
  }
});
