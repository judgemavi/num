import { auditLog } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createAccount, getAccount, updateAccount } from "./accounts";
import { createBankBalance, listBankBalances } from "./bank-balances";
import { createTransaction } from "./transactions";
import { expectCode, tempDatabase } from "./test-support";
import { createValuation, deleteValuation, listValuations, updateValuation } from "./valuations";

const saved = { source: "ui" as const, at: "2026-10-07T12:00:00.000Z" };
const entry = { date: "2026-02-01", balance: 50_000, note: null, ...saved };

function valuedAccount(db: ReturnType<typeof tempDatabase>["db"]) {
  return createAccount(db, { name: "Asset", kind: "investment", openingDate: "2026-01-01", openingBalance: 10_000, asOf: "2026-10-07", ...saved });
}

test("valuation dates are unique for each account and a failed change leaves no audit row", () => {
  const book = tempDatabase();
  try {
    const account = valuedAccount(book.db);
    createValuation(book.db, account.id, entry);
    expectCode(() => createValuation(book.db, account.id, entry), "valuation_exists");
    const next = createValuation(book.db, account.id, { ...entry, date: "2026-03-01" });
    expectCode(() => updateValuation(book.db, account.id, next.id, { date: entry.date, ...saved }), "valuation_exists");
    expect(book.db.select().from(auditLog).where(eq(auditLog.entity, "valuations")).all()).toHaveLength(2);
  } finally { book.close(); }
});

test("an account kind that does not use valuations rejects an entry", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, { name: "Cash", kind: "cash", asOf: "2026-10-07", ...saved });
    expectCode(() => createValuation(book.db, account.id, entry), "account_kind_no_valuations");
  } finally { book.close(); }
});

test("a kind change keeps valuations visible until the person deletes them", () => {
  const book = tempDatabase();
  try {
    const account = valuedAccount(book.db);
    const valuation = createValuation(book.db, account.id, entry);
    expectCode(() => updateAccount(book.db, account.id, { kind: "cash", ...saved }), "account_has_valuations");
    expect(updateAccount(book.db, account.id, { kind: "property", ...saved }).hasValuation).toBe(true);
    deleteValuation(book.db, account.id, valuation.id, saved);
    expect(updateAccount(book.db, account.id, { kind: "cash", ...saved }).kind).toBe("cash");
  } finally { book.close(); }
});

test("after the last valuation is deleted the balance and bank status use transactions", () => {
  const book = tempDatabase();
  try {
    const account = valuedAccount(book.db);
    for (const date of ["2026-01-15", "2026-02-15"]) {
      createTransaction(book.db, { accountId: account.id, date, amount: 2_000, payeeRaw: "Adjustment", lines: [{ amount: 2_000 }], ...saved });
    }
    createBankBalance(book.db, account.id, { date: "2026-03-01", balance: 14_000, ...saved });
    const valuation = createValuation(book.db, account.id, entry);
    expect(getAccount(book.db, account.id, "2026-10-07").balance).toBe(52_000);
    expect(listBankBalances(book.db, account.id).status?.difference).toBe(38_000);
    deleteValuation(book.db, account.id, valuation.id, saved);
    expect(getAccount(book.db, account.id, "2026-10-07").balance).toBe(14_000);
    expect(listBankBalances(book.db, account.id).status?.difference).toBe(0);
  } finally { book.close(); }
});

test("valuation writes keep the signed balance and a read can be written back", () => {
  const book = tempDatabase();
  try {
    for (const kind of ["mortgage", "loan"] as const) {
      const account = createAccount(book.db, { name: "Debt", kind, asOf: "2026-10-07", ...saved });
      const valuation = createValuation(book.db, account.id, { ...entry, balance: -50_000 });
      expect(valuation.balance).toBe(-50_000);
      const read = listValuations(book.db, account.id).items[0];
      if (!read) throw new Error("The valuation is missing.");
      expect(updateValuation(book.db, account.id, read.id, { ...read, ...saved }).balance).toBe(-50_000);
      expect(updateValuation(book.db, account.id, valuation.id, { note: "Updated note", ...saved }).balance).toBe(-50_000);
      expect(updateValuation(book.db, account.id, valuation.id, { balance: 40_000, ...saved }).balance).toBe(40_000);
    }
  } finally { book.close(); }
});
