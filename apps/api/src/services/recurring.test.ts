import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merchants, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { foldName, storedPayee } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";
import { createPlan } from "./recurring-plans";
import { linkOccurrence } from "./recurring-links";
import { autoLink, listOccurrences, recurringSignals } from "./recurring-view";

const at = "2026-10-07T16:00:00Z";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-recurring-"));
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

function account(db: ReturnType<typeof tempDatabase>["db"], name = "Chequing") {
  return createAccount(db, {
    name,
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 0,
    source: "ui",
    at,
  });
}

function merchant(db: ReturnType<typeof tempDatabase>["db"], name: string) {
  const id = crypto.randomUUID();
  db.insert(merchants).values({ id, name, sortKey: foldName(name), archivedAt: null }).run();
  return id;
}

function payment(
  db: ReturnType<typeof tempDatabase>["db"],
  accountId: string,
  date: string,
  amount: number,
  merchantId: string | null = null,
) {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      accountId,
      date,
      amount,
      merchantId,
      ...storedPayee("Example payee"),
      status: "cleared",
      source: "manual",
    })
    .run();
  return id;
}

function bill(db: ReturnType<typeof tempDatabase>["db"], accountId: string, mode: "fixed" | "variable" = "fixed") {
  return createPlan(db, {
    name: mode === "variable" ? "Pay" : "Stream",
    kind: "bill",
    accountId,
    expectedAmount: -10000,
    tolerance: 1000,
    amountMode: mode,
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    businessDayShift: "none",
    active: true,
    fundsBuckets: false,
    source: "ui",
    at,
  });
}

test("one transaction can link to one occurrence only", () => {
  const { db, close } = tempDatabase();
  try {
    const chequing = account(db);
    const first = bill(db, chequing.id);
    const second = createPlan(db, {
      name: "Other stream",
      kind: "bill",
      accountId: chequing.id,
      expectedAmount: -10000,
      tolerance: 1000,
      amountMode: "fixed",
      startDate: "2026-01-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    const txn = payment(db, chequing.id, "2026-01-15", -10000);
    linkOccurrence(db, first.id, "2026-01-15", txn, { source: "ui", at });
    expect(() => linkOccurrence(db, second.id, "2026-01-15", txn, { source: "ui", at })).toThrow(ServiceError);
    try {
      linkOccurrence(db, second.id, "2026-01-15", txn, { source: "ui", at });
    } catch (error) {
      expect((error as ServiceError).code).toBe("transaction_already_linked");
    }
    const shared = payment(db, chequing.id, "2026-02-15", -10000);
    const twin = createPlan(db, {
      name: "Twin stream",
      kind: "bill",
      accountId: chequing.id,
      expectedAmount: -10000,
      tolerance: 1000,
      amountMode: "fixed",
      startDate: "2026-02-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    expect(autoLink(db, "2026-02-20", { source: "ui", at }).linked).toBe(0);
    const ids = recurringSignals(db, "2026-02-20").ambiguous.map((item) => item.planId);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids).toContain(twin.id);
    expect(new Set(ids).size).toBe(3);
    expect(shared).toBeTruthy();
  } finally {
    close();
  }
});

test("auto-link saves the one candidate and leaves two candidates open", () => {
  const { db, close } = tempDatabase();
  try {
    const chequing = account(db);
    const shop = merchant(db, "Stream Co");
    const plan = createPlan(db, {
      name: "Stream",
      kind: "bill",
      accountId: chequing.id,
      merchantId: shop,
      expectedAmount: -16990,
      tolerance: 500,
      amountMode: "fixed",
      startDate: "2026-03-02",
      freq: "monthly",
      interval: 1,
      monthDay: 2,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    payment(db, chequing.id, "2026-03-06", -16990, shop);
    expect(autoLink(db, "2026-03-10", { source: "ui", at }).linked).toBe(0);
    const inside = payment(db, chequing.id, "2026-03-04", -16990, shop);
    expect(autoLink(db, "2026-03-10", { source: "ui", at }).linked).toBe(1);
    const linked = listOccurrences(db, plan.id, "2026-03-10").items.find((item) => item.dueDate === "2026-03-02");
    expect(linked?.transactionId).toBe(inside);
    payment(db, chequing.id, "2026-04-02", -16990, shop);
    payment(db, chequing.id, "2026-04-03", -17000, shop);
    expect(autoLink(db, "2026-04-10", { source: "ui", at }).linked).toBe(0);
    expect(recurringSignals(db, "2026-04-10").ambiguous.some((item) => item.dueDate === "2026-04-02")).toBe(true);
  } finally {
    close();
  }
});

test("a variable plan uses the last 6 actuals and does not report a changed amount", () => {
  const { db, close } = tempDatabase();
  try {
    const chequing = account(db);
    const plan = bill(db, chequing.id, "variable");
    const dates = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15"];
    const amounts = [-99_990, -500, -1000, -2000, -3000, -4000, -5000];
    for (let index = 0; index < 2; index += 1) {
      linkOccurrence(db, plan.id, dates[index] ?? "", payment(db, chequing.id, dates[index] ?? "", amounts[index] ?? 0), {
        source: "ui",
        at,
      });
    }
    expect(listOccurrences(db, plan.id, "2026-08-01")).toMatchObject({ forecastAmount: -10000, safeAmount: -10000 });
    expect(recurringSignals(db, "2026-08-01").changed).toEqual([]);
    for (let index = 2; index < dates.length; index += 1) {
      linkOccurrence(db, plan.id, dates[index] ?? "", payment(db, chequing.id, dates[index] ?? "", amounts[index] ?? 0), {
        source: "ui",
        at,
      });
    }
    expect(listOccurrences(db, plan.id, "2026-08-01")).toMatchObject({ forecastAmount: -2500, safeAmount: -5000 });
    expect(recurringSignals(db, "2026-08-01").changed).toEqual([]);

    const fixed = bill(db, chequing.id, "fixed");
    const odd = payment(db, chequing.id, "2026-01-15", -50000);
    linkOccurrence(db, fixed.id, "2026-01-15", odd, { source: "ui", at });
    expect(recurringSignals(db, "2026-08-01").changed).toEqual([
      {
        planId: fixed.id,
        dueDate: "2026-01-15",
        transactionId: odd,
        expectedAmount: -10000,
        actualAmount: -50000,
      },
    ]);
  } finally {
    close();
  }
});

test("an old unlinked occurrence is not missed", () => {
  const { db, close } = tempDatabase();
  try {
    const chequing = account(db);
    const plan = createPlan(db, {
      name: "Old bill",
      kind: "bill",
      accountId: chequing.id,
      expectedAmount: -10000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2024-01-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    const missed = recurringSignals(db, "2026-10-07").missed.filter((item) => item.planId === plan.id);
    expect(missed.map((item) => item.dueDate)).toEqual(["2026-09-15"]);
    const history = listOccurrences(db, plan.id, "2026-10-07").items.find((item) => item.dueDate === "2024-01-15");
    expect(history?.status).toBe("open");
  } finally {
    close();
  }
});

test("a payment with no merchant is detected by its category until a plan with that category covers it", () => {
  const { db, close } = tempDatabase();
  try {
    const chequing = account(db);
    const rent = createCategory(db, { name: "Rent", kind: "expense", essential: true, source: "ui", at });
    for (const date of ["2026-07-02", "2026-08-04", "2026-09-01", "2026-10-01"]) {
      createTransaction(db, {
        accountId: chequing.id,
        date,
        amount: -1_800_000,
        payeeRaw: `Transfer out ${date}`,
        merchantId: null,
        lines: [{ amount: -1_800_000, categoryId: rent.id, memo: null, transferAccountId: null, tagIds: [] }],
        source: "ui",
        at,
      });
    }
    const proposals = recurringSignals(db, "2026-10-14").proposals;
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ merchantId: null, categoryId: rent.id, freq: "monthly", expectedAmount: -1_800_000 });

    createPlan(db, {
      name: "Rent",
      kind: "bill",
      accountId: chequing.id,
      categoryId: rent.id,
      expectedAmount: -1_800_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-07-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    expect(recurringSignals(db, "2026-10-14").proposals).toEqual([]);
  } finally {
    close();
  }
});
