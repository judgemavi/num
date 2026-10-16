import { tempDatabase } from "./test-support";
import { expect, test } from "bun:test";
import { archiveAccount } from "./accounts";
import { forecastInput } from "./forecast";
import { expense, purchase, saved, spending } from "./bucket-test-book";
import { createBucketEvent } from "./bucket-events";
import { fillBuckets } from "./funding-fill";
import { createFundingReads } from "./funding-reads";
import { account } from "./funding-test-book";

test("monthly covers leave the prior-day balance intact when reads share financial inputs", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Example cash", "chequing", 100_000);
    const category = expense(book.db, "Example food");
    const bucket = spending(book.db, "Example spending", [category.id], 30_000);
    purchase(book.db, cash.id, category.id, -20_000, "2026-09-30");
    fillBuckets(book.db, { asOf: "2026-10-08", ...saved });
    const reads = createFundingReads(book.db, "2026-10-08");
    expect(reads.balancesOn("2026-09-30").get(bucket.id)).toBe(-20_000);
    expect(reads.position.balances.get(bucket.id)).toBe(30_000);
    expect(reads.monthlyRows().find((row) => row.bucket.id === bucket.id)).toMatchObject({ monthly: 30_000, funded: 30_000, owed: 0 });
    expect(reads.balancesOn("2026-09-30").get(bucket.id)).toBe(-20_000);
    expect(reads.monthlyRows("2026-11").find((row) => row.bucket.id === bucket.id)).toMatchObject({ monthly: 0, funded: 0, owed: 0 });
    expect(reads.position.balances.get(bucket.id)).toBe(30_000);
    createBucketEvent(book.db, bucket.id, { kind: "release", date: "2026-10-08", amount: 10_000, ...saved });
    expect(createFundingReads(book.db, "2026-10-08").position.balances.get(bucket.id)).toBe(20_000);
  } finally {
    book.close();
  }
});

test("the forecast uses only open accounts from the shared on-budget balances", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Example open cash", "chequing", 100_000);
    const archived = account(book.db, "Example archived cash", "chequing", 50_000);
    archiveAccount(book.db, archived.id, { confirm: true, ...saved });
    const reads = createFundingReads(book.db, "2026-10-08");
    expect(reads.position.onBudgetTotal).toBe(150_000);
    const forecast = forecastInput(book.db, "2026-10-08", reads.position.accountBalances);
    expect(forecast.balance).toBe(100_000);
    expect(forecast).toEqual(forecastInput(book.db, "2026-10-08"));
  } finally {
    book.close();
  }
});
