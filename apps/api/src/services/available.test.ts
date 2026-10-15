import { expect, test } from "bun:test";
import { readAvailable } from "./available";
import { createBucketEvent } from "./bucket-events";
import { expense, saved, tempDatabase } from "./bucket-test-book";
import { fundingPosition } from "./funding-book";
import { account, addSchedule, emergency, money, sinking, spend } from "./funding-test-book";
import { linkOccurrence, skipOccurrence } from "./recurring-links";

const asOf = "2026-10-08";

function fund(db: ReturnType<typeof tempDatabase>["db"], bucketId: string, amount: number) {
  createBucketEvent(db, bucketId, { kind: "fund", amount, date: asOf, asOf, ...saved });
}

/**
 * Cash 1 000 000. A trip fund (sinking) holds 100 000, the emergency fund 50 000, Food (spending) 30 000 and Rent
 * (a bill of 40 000 on the 15th) 10 000.
 */
function book() {
  const value = tempDatabase();
  const cash = account(value.db, "Cash", "chequing", 1_000_000);
  const trip = sinking(value.db, "Trip", 300_000, "2027-06-01");
  const reserve = emergency(value.db, 3);
  const food = spend(value.db, "Food", 30_000);
  const rent = addSchedule(value.db, {
    name: "Rent",
    kind: "commitment",
    accountId: cash.id,
    expectedAmount: -40_000,
    startDate: "2026-10-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
  });
  fund(value.db, trip.id, 100_000);
  fund(value.db, reserve.id, 50_000);
  fund(value.db, food.id, 30_000);
  fund(value.db, rent.id, 10_000);
  return { ...value, cash, rent };
}

test("available to spend subtracts the savings buckets and the bills set aside, with the short amount of a bill due in 30 days", () => {
  const { db, close } = book();
  try {
    expect(readAvailable(db, asOf)).toEqual({
      asOf,
      onBudgetTotal: 1_000_000,
      savings: 150_000,
      billsSetAside: 40_000,
      available: 810_000,
    });
    // The same result: Unassigned + the spending buckets − the short amount of the bills.
    expect(fundingPosition(db, asOf).unassigned + 30_000 - 30_000).toBe(810_000);
  } finally {
    close();
  }
});

test("a skipped occurrence is not short, and a bill due after 30 days counts only its balance", () => {
  const { db, close, rent } = book();
  try {
    skipOccurrence(db, rent.id, "2026-10-15", "Paid early", saved);
    expect(readAvailable(db, asOf)).toMatchObject({ billsSetAside: 10_000, available: 840_000 });
    // On 2026-09-14 the occurrence of 2026-10-15 is 31 days later.
    expect(readAvailable(db, "2026-09-14").billsSetAside).toBe(10_000);
  } finally {
    close();
  }
});

test("a linked occurrence is not short, and a negative bucket is not subtracted", () => {
  const { db, close, cash, rent } = book();
  try {
    const housing = expense(db, "Housing");
    const paid = money(db, cash.id, housing.id, "2026-10-08", -40_000, "Landlord");
    linkOccurrence(db, rent.id, "2026-10-15", paid.id, saved);
    // Rent is 10 000 − 40 000 = −30 000. It is not a bill set aside, and it is not added back.
    expect(readAvailable(db, asOf)).toEqual({
      asOf,
      onBudgetTotal: 960_000,
      savings: 150_000,
      billsSetAside: 0,
      available: 810_000,
    });
  } finally {
    close();
  }
});
