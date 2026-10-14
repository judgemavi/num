import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createPlan } from "./recurring-plans";
import { autoLink, listOccurrences } from "./recurring-view";
import { readTransaction } from "./transaction-record";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-recurring-label-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a linked plan labels an open payment and keeps the label that the person confirmed", () => {
  const { db, close } = tempDatabase();
  try {
    const account = createAccount(db, {
      name: "Chequing",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const rent = createCategory(db, { name: "Rent", kind: "expense", ...saved });
    const housing = createCategory(db, { name: "Housing", kind: "expense", ...saved });
    const plan = createPlan(db, {
      name: "Rent",
      kind: "bill",
      accountId: account.id,
      categoryId: rent.id,
      expectedAmount: -2_550_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const payment = (date: string, categoryId?: string) =>
      createTransaction(db, {
        accountId: account.id,
        date,
        amount: -2_550_000,
        payeeRaw: "SEND E-TFR",
        lines: [{ amount: -2_550_000, categoryId }],
        ...saved,
      }).id;
    const open = payment("2026-03-01");
    const confirmed = payment("2026-04-01", housing.id);

    expect(autoLink(db, "2026-04-10", saved).linked).toBe(2);

    const labelled = readTransaction(db, open);
    expect(labelled.autoReason).toBe("recurring");
    expect(labelled.lines[0]?.categoryId).toBe(rent.id);

    const kept = readTransaction(db, confirmed);
    expect(kept.autoReason).toBeNull();
    expect(kept.lines[0]?.categoryId).toBe(housing.id);

    const links = listOccurrences(db, plan.id, "2026-04-10").items.map((item) => item.transactionId);
    expect(links).toContain(open);
    expect(links).toContain(confirmed);
  } finally {
    close();
  }
});
