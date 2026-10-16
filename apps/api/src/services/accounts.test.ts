import { expectCode } from "./test-support";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactions, valuations } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { archiveAccount, createAccount, listAccounts, restoreAccount, updateAccount } from "./accounts";
import { storedPayee, type AccountCreate, type AccountKind, type AccountUpdate } from "@num/shared";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-accounts-"));
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

const at = "2026-10-07T16:00:00Z";

function base(kind: AccountKind, openingBalance = 0): AccountCreate & { source: "ui"; at: string } {
  return {
    asOf: "2026-10-07",
    name: "Example account",
    institution: null,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    source: "ui",
    at,
  };
}

function card(kind: AccountKind = "credit_card"): AccountCreate & { source: "ui"; at: string } {
  return {
    ...base(kind),
    paymentPolicy: "full",
  };
}


function addTransaction(db: Db, accountId: string, date: string, amount: number) {
  db.insert(transactions)
    .values({
      id: crypto.randomUUID(),
      accountId,
      date,
      amount,
      ...storedPayee("Example shop"),
      status: "cleared",
      source: "manual",
    })
    .run();
}

function addValuation(db: Db, accountId: string, date: string, balance: number) {
  db.insert(valuations)
    .values({
      id: crypto.randomUUID(),
      accountId,
      date,
      balance,
    })
    .run();
}

function balanceOf(db: Db, id: string): number {
  const page = listAccounts(db, { page: 1, pageSize: 50, archived: false });
  const account = page.items.find((item) => item.id === id);
  if (!account) {
    throw new Error("Account is missing");
  }
  return account.balance;
}

test("a transaction account balance is the opening balance plus transactions", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, base("chequing", 10000));
    addTransaction(book.db, account.id, "2026-02-01", -2500);
    addTransaction(book.db, account.id, "2026-02-02", 250);
    addValuation(book.db, account.id, "2026-02-01", 50000);
    expect(balanceOf(book.db, account.id)).toBe(7750);
  } finally {
    book.close();
  }
});

test("a valuation account balance uses the latest valuation and later transactions", () => {
  const book = tempDatabase();
  try {
    for (const kind of ["investment", "property", "mortgage", "loan"] as const) {
      const account = createAccount(book.db, { ...base(kind, 9990), name: kind });
      addValuation(book.db, account.id, "2026-03-01", 5000);
      addValuation(book.db, account.id, "2026-06-01", 10000);
      addTransaction(book.db, account.id, "2026-05-01", -1000);
      addTransaction(book.db, account.id, "2026-06-01", 2000);
      addTransaction(book.db, account.id, "2026-06-02", 3000);
      expect(balanceOf(book.db, account.id)).toBe(13000);
    }

    const empty = createAccount(book.db, { ...base("investment", 10000), name: "No valuation" });
    addTransaction(book.db, empty.id, "2026-02-01", 500);
    expect(balanceOf(book.db, empty.id)).toBe(10500);

    const mortgage = createAccount(book.db, { ...base("mortgage", -200000), name: "Home debt" });
    addValuation(book.db, mortgage.id, "2026-06-01", -150000);
    addTransaction(book.db, mortgage.id, "2026-07-01", 5000);
    expect(balanceOf(book.db, mortgage.id)).toBe(-145000);
  } finally {
    book.close();
  }
});

test("a kind change across classes is rejected", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, base("chequing"));
    const next: AccountUpdate = {
      name: cash.name,
      institution: null,
      kind: "credit_card",
      onBudget: true,
      openingDate: cash.openingDate,
      openingBalance: cash.openingBalance,
      paymentPolicy: "full",
    };
    expectCode(() => updateAccount(book.db, cash.id, { ...next, source: "ui", at }), "kind_class_mismatch");

    const cardAccount = createAccount(book.db, card());
    const sameClass: AccountUpdate = {
      name: "Example loan",
      institution: null,
      kind: "loan",
      onBudget: false,
      openingDate: cardAccount.openingDate,
      openingBalance: 0,
      paymentPolicy: null,
      fixedPayment: null,
    };
    const updated = updateAccount(book.db, cardAccount.id, { ...sameClass, source: "ui", at });
    expect(updated.kind).toBe("loan");
    expect(updated.paymentPolicy).toBeNull();
  } finally {
    book.close();
  }
});

test("archive of a non-zero balance needs confirmation", () => {
  const book = tempDatabase();
  try {
    const open = createAccount(book.db, base("chequing", 1000));
    expectCode(
      () => archiveAccount(book.db, open.id, { confirm: false, source: "ui", at }),
      "archive_confirmation_required",
    );
    const archived = archiveAccount(book.db, open.id, { confirm: true, source: "ui", at });
    expect(archived.archivedAt).toBe(at);
    expect(archived.balance).toBe(1000);

    const settled = createAccount(book.db, { ...base("savings", 400), name: "Settled" });
    addTransaction(book.db, settled.id, "2026-04-01", -400);
    const zero = archiveAccount(book.db, settled.id, { confirm: false, source: "ui", at });
    expect(zero.balance).toBe(0);
    expect(zero.archivedAt).toBe(at);

    const valued = createAccount(book.db, { ...base("property", 0), name: "House" });
    addValuation(book.db, valued.id, "2026-06-01", 2500000);
    expectCode(
      () => archiveAccount(book.db, valued.id, { confirm: false, source: "ui", at }),
      "archive_confirmation_required",
    );
  } finally {
    book.close();
  }
});

test("card fields belong only to a credit card", () => {
  const book = tempDatabase();
  try {
    expectCode(() => createAccount(book.db, { ...base("chequing"), paymentPolicy: "full" }), "card_fields_invalid");
    expectCode(() => createAccount(book.db, base("credit_card")), "card_fields_invalid");
    expectCode(
      () => createAccount(book.db, { ...card(), paymentPolicy: "fixed" }),
      "card_fields_invalid",
    );
    expectCode(
      () => createAccount(book.db, { ...card(), fixedPayment: 5000 }),
      "card_fields_invalid",
    );

    const created = createAccount(book.db, {
      ...card(),
      paymentPolicy: "fixed",
      fixedPayment: 25000,
    });
    expect(created.paymentPolicy).toBe("fixed");
    expect(created.fixedPayment).toBe(25000);
    expect(created.onBudget).toBe(true);

    const mortgage = createAccount(book.db, base("mortgage"));
    expect(mortgage.onBudget).toBe(false);

    expectCode(
      () => createAccount(book.db, { ...base("chequing"), interestRateMilliPct: 150 }),
      "interest_rate_invalid",
    );
    expectCode(
      () => createAccount(book.db, { ...card(), interestRateMilliPct: 150, name: "Card rate" }),
      "interest_rate_invalid",
    );
    const savings = createAccount(book.db, { ...base("savings"), interestRateMilliPct: 150, name: "Savings" });
    expect(savings.interestRateMilliPct).toBe(150);
  } finally {
    book.close();
  }
});

test("the account list shows active accounts unless archived is requested", () => {
  const book = tempDatabase();
  try {
    createAccount(book.db, { ...base("chequing"), name: "Open account" });
    const closed = createAccount(book.db, { ...base("savings"), name: "Closed account" });
    archiveAccount(book.db, closed.id, { confirm: false, source: "ui", at });

    const active = listAccounts(book.db, { page: 1, pageSize: 50, archived: false });
    expect(active.total).toBe(1);
    expect(active.items.map((item) => item.name)).toEqual(["Open account"]);

    const archived = listAccounts(book.db, { page: 1, pageSize: 50, archived: true });
    expect(archived.total).toBe(1);
    expect(archived.items.map((item) => item.name)).toEqual(["Closed account"]);

    const restored = restoreAccount(book.db, closed.id, { source: "ui", at });
    expect(restored.archivedAt).toBeNull();
    expect(listAccounts(book.db, { page: 1, pageSize: 50, archived: false }).total).toBe(2);
    expectCode(() => restoreAccount(book.db, closed.id, { source: "ui", at }), "account_not_archived");
  } finally {
    book.close();
  }
});
