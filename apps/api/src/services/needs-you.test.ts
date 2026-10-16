import { tempDatabase } from "./test-support";
import { expect, test } from "bun:test";
import { createBankBalance } from "./bank-balances";
import { expense, saved } from "./bucket-test-book";
import { fillBuckets } from "./funding-fill";
import { account, addSchedule, money, spend } from "./funding-test-book";
import { readNeedsYou } from "./needs-you";
import { createTransaction } from "./transactions";

const asOf = "2026-10-08";

test("a book where no check fails has no item, and a bank balance that matches is not an item", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing", 100_000);
    createBankBalance(db, cash.id, { date: asOf, balance: 100_000, ...saved });
    expect(readNeedsYou(db, asOf)).toEqual({ asOf, items: [] });
  } finally {
    close();
  }
});

test("each check that fails is an item, in the order of Home", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing", 1_000);
    const groceries = expense(db, "Groceries");
    spend(db, "Food", 1_000, { categoryIds: [groceries.id] });
    const rent = addSchedule(db, {
      name: "Rent",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -500,
      startDate: "2026-09-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
    });
    money(db, cash.id, groceries.id, "2026-10-02", -3_000, "Market");
    createTransaction(db, { accountId: cash.id, date: "2026-10-03", amount: -100, payeeRaw: "Kiosk", lines: [{ amount: -100 }], ...saved });
    createBankBalance(db, cash.id, { date: "2026-10-03", balance: 0, ...saved });
    fillBuckets(db, { asOf, ...saved });

    const items = readNeedsYou(db, asOf).items;
    expect(items.map((item) => item.code)).toEqual(["review", "bank_mismatch", "missed", "overspent", "bills_short", "pool_short"]);
    expect(items.filter((item) => item.code !== "pool_short")).toEqual([
      { code: "review", count: 1, oldCount: 0 },
      { code: "bank_mismatch", accountId: cash.id, difference: -2_100 },
      // The window of 2026-09-15 ended on 2026-09-30.
      { code: "missed", bucketId: rent.id, dueDate: "2026-09-15" },
      { code: "overspent", count: 1, balance: -2_100 },
      { code: "bills_short", bucketId: rent.id, dueDate: "2026-10-15", short: 500 },
    ]);
  } finally {
    close();
  }
});
