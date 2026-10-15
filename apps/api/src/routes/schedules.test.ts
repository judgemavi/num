import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createApp } from "../app";
import { createDb } from "../db";
import { createAccount } from "../services/accounts";
import { runSetup } from "../services/setup";

const asOf = "2026-10-08";
const saved = { source: "ui" as const, at: "2026-10-08T16:00:00Z" };

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-schedule-routes-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  runSetup(db, { asOf: "2026-10-07", currency: "CAD", categorySet: "default", ...saved });
  const account = createAccount(db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  return {
    accountId: account.id,
    app: createApp(db, { dataDir: dir }),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function body(accountId: string, kind: "commitment" | "income", schedule: Record<string, unknown> = {}) {
  return {
    name: kind === "income" ? "Pay" : "Rent",
    kind,
    priority: 0,
    essential: kind === "commitment" ? true : null,
    color: "sky",
    icon: "wallet",
    categoryIds: [],
    refillTo: null,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    canRecede: null,
    schedule: {
      accountId,
      expectedAmount: kind === "income" ? 500_000 : -100_000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      endDate: null,
      ...schedule,
    },
  };
}

async function create(book: ReturnType<typeof tempBook>, json: unknown) {
  return book.app.request(`/api/buckets?asOf=${asOf}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json),
  });
}

test("the schedule routes are not taken by the bucket id route", async () => {
  const book = tempBook();
  try {
    for (const path of ["upcoming", "signals"]) {
      const response = await book.app.request(`/api/buckets/${path}?asOf=${asOf}`);
      expect(response.status).toBe(200);
    }
  } finally {
    book.close();
  }
});

test("a commitment and an income are created with their schedule, and the schedule rules are checked", async () => {
  const book = tempBook();
  try {
    expect((await create(book, body(book.accountId, "commitment"))).status).toBe(200);
    expect((await create(book, body(book.accountId, "income"))).status).toBe(200);
    const upcoming = (await (await book.app.request(`/api/buckets/upcoming?asOf=${asOf}`)).json()) as { items: { dueDate: string }[] };
    expect(upcoming.items.map((item) => item.dueDate)).toEqual(["2026-11-01", "2026-11-01"]);

    const transfer = await create(book, body(book.accountId, "income", { transferAccountId: book.accountId }));
    expect(transfer.status).toBe(400);
    const noSchedule = await create(book, { ...body(book.accountId, "commitment"), schedule: null });
    expect(noSchedule.status).toBe(400);
    const plain = await create(book, { ...body(book.accountId, "commitment"), kind: "spending", refillTo: 1000 });
    expect(plain.status).toBe(400);
  } finally {
    book.close();
  }
});
