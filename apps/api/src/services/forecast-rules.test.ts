import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
import { readForecast } from "./forecast";
import { linkOccurrence, skipOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const at = "2026-10-08T16:00:00Z";
const saved = { source: "ui" as const, at };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-forecast-rules-"));
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

function cashAccount(db: Db, name: string, openingBalance: number) {
  return createAccount(db, { name, kind: "chequing", openingDate: "2026-01-01", openingBalance, ...saved });
}

function cardAccount(db: Db, policy: "full" | "manual" | "fixed", fixedPayment: number | null = null) {
  return createAccount(db, {
    name: "Card",
    kind: "credit_card",
    openingDate: "2026-01-01",
    openingBalance: 0,
    paymentPolicy: policy,
    fixedPayment,
    ...saved,
  });
}

function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", ...saved });
}

function spend(db: Db, accountId: string, categoryId: string, date: string, amount: number) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Shop",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function payCard(db: Db, fromId: string, cardId: string, date: string, amount: number) {
  return createTransaction(db, {
    accountId: fromId,
    date,
    amount: -amount,
    payeeRaw: "Card payment",
    lines: [{ amount: -amount, transferAccountId: cardId }],
    ...saved,
  });
}

function bill(
  db: Db,
  accountId: string,
  amount: number,
  startDate: string,
  shift: "none" | "next" = "none",
  monthDay = 15,
  endDate: string | null = null,
) {
  return createPlan(db, {
    name: `Bill ${startDate}`,
    kind: "bill",
    accountId,
    expectedAmount: amount,
    tolerance: 0,
    amountMode: "fixed",
    startDate,
    freq: "monthly",
    interval: 1,
    monthDay,
    businessDayShift: shift,
    endDate,
    active: true,
    fundsBuckets: false,
    ...saved,
  });
}

test("a card has no below-zero risk", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000);
    const card = cardAccount(book.db, "manual");
    spend(book.db, card.id, expense(book.db, "Shop").id, "2026-10-01", -5_000);
    bill(book.db, cash.id, -2_000, "2026-10-15");
    const forecast = readForecast(book.db, "2026-10-08");
    expect(forecast.accounts.find((row) => row.accountId === card.id)?.risk).toBeNull();
    expect(forecast.accounts.find((row) => row.accountId === cash.id)?.known[forecast.dates.indexOf("2026-10-14")]).toBe(1_000);
    expect(forecast.accounts.find((row) => row.accountId === cash.id)?.risk).toBe("below_zero");
    expect(forecast.warnings).toEqual([{ code: "manual_card", accountId: card.id }]);
  } finally {
    book.close();
  }
});

test("one chequing account pays the card when there is no payment history", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    const other = cashAccount(book.db, "Other", 100_000);
    const card = cardAccount(book.db, "full");
    spend(book.db, card.id, expense(book.db, "Shop").id, "2026-10-01", -20_000);
    createCheckpoint(book.db, card.id, { date: "2026-10-01", statementBalance: -20_000, ...saved });
    const two = readForecast(book.db, "2026-10-08");
    const due = two.dates.indexOf("2026-10-22");
    expect(two.warnings).toContainEqual({ code: "no_payment_account", accountId: card.id });
    expect(two.accounts.find((row) => row.accountId === cash.id)?.known[due]).toBe(100_000);
    expect(two.accounts.find((row) => row.accountId === other.id)?.known[due]).toBe(100_000);
  } finally {
    book.close();
  }
  const alone = tempDatabase();
  try {
    const cash = cashAccount(alone.db, "Cash", 100_000);
    const card = cardAccount(alone.db, "full");
    spend(alone.db, card.id, expense(alone.db, "Shop").id, "2026-10-01", -20_000);
    createCheckpoint(alone.db, card.id, { date: "2026-10-01", statementBalance: -20_000, ...saved });
    const one = readForecast(alone.db, "2026-10-08");
    const due = one.dates.indexOf("2026-10-22");
    const before = one.dates.indexOf("2026-10-21");
    const cashRow = one.accounts.find((row) => row.accountId === cash.id);
    expect(one.warnings).toEqual([]);
    expect(cashRow?.known[before]).toBe(100_000);
    expect(cashRow?.known[due]).toBe(80_000);
    expect(one.total.known[before]).toBe(one.total.known[due]);
  } finally {
    alone.close();
  }
});

test("a stale statement still schedules the next payment from the balance at asOf", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    const card = cardAccount(book.db, "full");
    spend(book.db, card.id, expense(book.db, "Shop").id, "2026-07-01", -30_000);
    createCheckpoint(book.db, card.id, { date: "2026-07-01", statementBalance: -30_000, ...saved });
    const forecast = readForecast(book.db, "2026-10-08");
    const due = forecast.dates.indexOf("2026-10-22");
    const before = forecast.dates.indexOf("2026-10-21");
    const cashRow = forecast.accounts.find((row) => row.accountId === cash.id);
    const cardRow = forecast.accounts.find((row) => row.accountId === card.id);
    expect(cashRow?.estimated[before]).toBe(100_000);
    expect(cashRow?.estimated[due]).toBe(70_000);
    expect(cardRow?.estimated[due]).toBe(0);
    expect(forecast.total.estimated[before]).toBe(forecast.total.estimated[due]);
  } finally {
    book.close();
  }
});

test("a partial payment reduces the next card payment", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 200_000);
    const card = cardAccount(book.db, "full");
    spend(book.db, card.id, expense(book.db, "Shop").id, "2026-10-01", -20_000);
    createCheckpoint(book.db, card.id, { date: "2026-10-01", statementBalance: -20_000, ...saved });
    payCard(book.db, cash.id, card.id, "2026-10-05", 5_000);
    const forecast = readForecast(book.db, "2026-10-08");
    const due = forecast.dates.indexOf("2026-10-22");
    const before = forecast.dates.indexOf("2026-10-21");
    const cashRow = forecast.accounts.find((row) => row.accountId === cash.id);
    expect(cashRow?.known[before]).toBe(195_000);
    expect(cashRow?.known[due]).toBe(180_000);
  } finally {
    book.close();
  }
});

test("fixed and manual cards follow their payment policy", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    const card = cardAccount(book.db, "fixed", 10_000);
    spend(book.db, card.id, expense(book.db, "Shop").id, "2026-10-01", -40_000);
    createCheckpoint(book.db, card.id, { date: "2026-10-01", statementBalance: -40_000, ...saved });
    const forecast = readForecast(book.db, "2026-10-08");
    const due = forecast.dates.indexOf("2026-10-22");
    expect(forecast.accounts.find((row) => row.accountId === cash.id)?.known[due]).toBe(90_000);
    expect(forecast.accounts.find((row) => row.accountId === card.id)?.known[due]).toBe(-30_000);
    expect(forecast.accounts.find((row) => row.accountId === card.id)?.risk).toBeNull();
  } finally {
    book.close();
  }
});

test("off-budget lines are excluded from category medians", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const outside = createAccount(book.db, {
      name: "Outside",
      kind: "chequing",
      onBudget: false,
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const snacks = expense(book.db, "Snacks");
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      spend(book.db, cash.id, snacks.id, `${month}-10`, -1_000);
      spend(book.db, outside.id, snacks.id, `${month}-11`, -100_000);
    }
    const forecast = readForecast(book.db, "2026-04-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 40);
  } finally {
    book.close();
  }
});

test("a business-day shift moves the bill, and skipped or linked occurrences are excluded", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    bill(book.db, cash.id, -4_000, "2026-10-10", "next", 10, "2026-10-10");
    const plan = bill(book.db, cash.id, -10_000, "2026-10-15");
    const linked = spend(book.db, cash.id, expense(book.db, "Rent").id, "2026-10-15", -10_000);
    linkOccurrence(book.db, plan.id, "2026-10-15", linked.id, saved);
    skipOccurrence(book.db, plan.id, "2026-11-15", "Away", saved);
    const forecast = readForecast(book.db, "2026-10-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    const atDate = (iso: string) => row?.known[forecast.dates.indexOf(iso)];
    expect(atDate("2026-10-10")).toBe(100_000);
    expect(atDate("2026-10-12")).toBe(96_000);
    expect(atDate("2026-10-15")).toBe(86_000);
    expect(atDate("2026-11-15")).toBe(86_000);
    expect(atDate("2026-12-15")).toBe(76_000);
  } finally {
    book.close();
  }
});

test("a bill linked to a plan is not in the category median", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const snacks = expense(book.db, "Snacks");
    const plan = bill(book.db, cash.id, -4_000, "2026-01-12", "none", 12);
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      spend(book.db, cash.id, snacks.id, `${month}-10`, -1_000);
      const linked = spend(book.db, cash.id, snacks.id, `${month}-12`, -4_000);
      linkOccurrence(book.db, plan.id, `${month}-12`, linked.id, saved);
    }
    const forecast = readForecast(book.db, "2026-04-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 40);
  } finally {
    book.close();
  }
});
