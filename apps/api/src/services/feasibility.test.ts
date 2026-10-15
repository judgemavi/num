import { expect, test } from "bun:test";
import { archiveBucket } from "./buckets";
import { createBucketEvent } from "./bucket-events";
import { expense, saved, tempDatabase } from "./bucket-test-book";
import { readFeasibility } from "./feasibility";
import { fillBuckets } from "./funding-fill";
import { account, addSchedule, money, sinking, spend } from "./funding-test-book";

test("funding and spending inside the month do not change feasibility, and an archived bucket is not in it", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing", 10_000_000);
    const groceries = expense(db, "Groceries");
    addSchedule(db, { name: "Pay", kind: "income", accountId: cash.id, expectedAmount: 1_000_000, startDate: "2026-03-01", freq: "monthly", interval: 1, monthDay: 1 });
    spend(db, "Food", 400_000, { categoryIds: [groceries.id] });
    sinking(db, "Tax", 600_000, "2026-05-31");
    const old = spend(db, "Old", 20_000);
    createBucketEvent(db, old.id, { kind: "fund", amount: 20_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    createBucketEvent(db, old.id, { kind: "release", amount: 20_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    archiveBucket(db, old.id, saved);

    const before = readFeasibility(db, "2026-03-20").feasibility;
    expect(before).toMatchObject({ income: 1_000_000, commitments: 0, refills: 400_000, surplus: 600_000, need: 300_000, shortfall: 0 });
    fillBuckets(db, { asOf: "2026-03-20", ...saved });
    money(db, cash.id, groceries.id, "2026-03-12", -80_000, "Market");
    expect(readFeasibility(db, "2026-03-20").feasibility).toEqual(before);
  } finally {
    close();
  }
});
