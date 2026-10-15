import { expect, test } from "bun:test";
import { readAvailable } from "./available";
import { listBillNeeds } from "./bills";
import { expense, saved, tempDatabase } from "./bucket-test-book";
import { account, addSchedule, money, spend } from "./funding-test-book";
import { needsYouChecks } from "./needs-you-checks";
import { autoLink, recurringSignals } from "./recurring-view";

const asOf = "2026-10-15";

/** Rent of 255 000 due on 2026-11-02 and Food (spending, refill 100 000). Nothing is funded. */
function book(cash: number, rentFirst: boolean) {
  const value = tempDatabase();
  const chequing = account(value.db, "Cash", "chequing", cash);
  const food = spend(value.db, "Food", 100_000, { priority: rentFirst ? 1 : 0 });
  const rent = addSchedule(value.db, {
    name: "Rent",
    kind: "commitment",
    accountId: chequing.id,
    expectedAmount: -255_000,
    startDate: "2026-11-02",
    freq: "monthly",
    interval: 1,
    monthDay: 2,
    priority: rentFirst ? 0 : 1,
  });
  return { ...value, chequing, food, rent };
}

function billsShort(db: ReturnType<typeof tempDatabase>["db"]) {
  return needsYouChecks(db, asOf).find((check) => check.code === "bills_short");
}

test("Unassigned covers the gap of a bill due next month: the bill is not short", () => {
  const { db, close, rent } = book(400_000, true);
  try {
    expect(listBillNeeds(db, asOf).items).toEqual([{ bucketId: rent.id, dueDate: "2026-11-02", amount: 255_000, gap: 255_000, covered: 255_000, short: 0 }]);
    expect(billsShort(db)).toEqual({ code: "bills_short", pass: true, items: [] });
  } finally {
    close();
  }
});

test("a bucket that is not a bill and comes first takes its owed amount of the month of the payment first", () => {
  const { db, close, rent } = book(300_000, false);
  try {
    // Food owes 100 000 for November. 200 000 is left for Rent.
    expect(listBillNeeds(db, asOf).items).toEqual([{ bucketId: rent.id, dueDate: "2026-11-02", amount: 255_000, gap: 255_000, covered: 200_000, short: 55_000 }]);
    expect(billsShort(db)).toEqual({ code: "bills_short", pass: false, items: [{ bucketId: rent.id, dueDate: "2026-11-02", short: 55_000 }] });
  } finally {
    close();
  }
});

test("Available to spend subtracts the whole gap, also the part that Unassigned covers", () => {
  const covered = book(400_000, true);
  const short = book(300_000, false);
  try {
    expect(readAvailable(covered.db, asOf)).toMatchObject({ unassigned: 400_000, billsSetAside: 255_000, available: 145_000 });
    expect(readAvailable(short.db, asOf)).toMatchObject({ unassigned: 300_000, billsSetAside: 255_000, available: 45_000 });
  } finally {
    covered.close();
    short.close();
  }
});

test("a late payment links in the window of its occurrence: it is not missed, and the next payment moves on", () => {
  const { db, close, chequing } = book(400_000, true);
  try {
    const phone = expense(db, "Phone");
    const mobile = addSchedule(db, {
      name: "Mobile",
      kind: "commitment",
      accountId: chequing.id,
      expectedAmount: -5_000,
      startDate: "2026-09-04",
      freq: "monthly",
      interval: 1,
      monthDay: 4,
    });
    const income = expense(db, "Rental income");
    addSchedule(db, {
      name: "Rental income",
      kind: "income",
      accountId: chequing.id,
      expectedAmount: 150_000,
      startDate: "2026-09-06",
      freq: "monthly",
      interval: 1,
      monthDay: 6,
    });
    money(db, chequing.id, phone.id, "2026-09-04", -5_000, "Mobile");
    money(db, chequing.id, income.id, "2026-09-06", 150_000, "Tenant");
    // Before the payment: the window of 2026-10-04 is open to 2026-10-20 (not included), thus it is the next payment and not missed.
    expect(listBillNeeds(db, asOf).items.find((item) => item.bucketId === mobile.id)?.dueDate).toBe("2026-10-04");
    expect(recurringSignals(db, asOf).missed).toEqual([]);
    expect(recurringSignals(db, "2026-10-20").missed).toEqual([{ bucketId: mobile.id, dueDate: "2026-10-04" }]);
    // The payments come 5 and 6 days late.
    money(db, chequing.id, phone.id, "2026-10-09", -5_000, "Mobile");
    money(db, chequing.id, income.id, "2026-10-12", 150_000, "Tenant");
    // The run links the open occurrences of September too: each payment is in its window.
    expect(autoLink(db, asOf, saved).linked).toBe(4);
    expect(recurringSignals(db, "2026-10-20").missed).toEqual([]);
    expect(listBillNeeds(db, asOf).items.find((item) => item.bucketId === mobile.id)?.dueDate).toBe("2026-11-04");
  } finally {
    close();
  }
});
