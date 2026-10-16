import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, mortgageTerms, openDatabase, settings } from "@num/db";
import type { MortgageTermsWrite } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { createAccount, getAccount, updateAccount } from "./accounts";
import { createCategory } from "./categories";
import { mortgageAccountView } from "./mortgage";
import { bankOpeningSuggestion, importOpeningSuggestion } from "./opening-suggestion";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-09-01";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-mortgage-terms-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const chequing = createAccount(db, { asOf: "2026-10-07", name: "Everyday", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const interest = createCategory(db, { name: "Interest", kind: "expense", ...saved });
  const terms: MortgageTermsWrite = {
    rateMilliPct: 5000,
    compounding: "semiannual",
    paymentAmount: 581_600,
    paymentFrequency: "monthly",
    firstPaymentDate: "2026-03-01",
    termEnd: "2031-03-01",
    amortizationMonthsRemaining: 300,
    paymentAccountId: chequing.id,
    interestCategoryId: interest.id,
    propertyAccountId: null,
  };
  return {
    db,
    terms,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function mortgageFields(openingBalance: number, mortgageTerms?: MortgageTermsWrite | null, openingDate: string | null = "2026-02-01") {
  return {
    name: "Home loan",
    kind: "mortgage" as const,
    onBudget: false,
    openingDate,
    openingBalance,
    mortgageTerms,
    ...saved,
  };
}

test("the schedule starts from the opening balance on the opening date", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", ...mortgageFields(-100_000_000, sample.terms), onBudget: undefined });
    const view = mortgageAccountView(sample.db, mortgage.id, asOf, {});
    expect(view.payments[0]).toMatchObject({ date: "2026-03-01", interest: 412_390, principal: 169_210 });
    expect(view.payments[0]?.balance).toBe(100_000_000 - 169_210);
  } finally {
    sample.close();
  }
});

test("a change of the opening balance changes the schedule", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", ...mortgageFields(-100_000_000, sample.terms), onBudget: undefined });
    const before = mortgageAccountView(sample.db, mortgage.id, asOf, {});
    updateAccount(sample.db, mortgage.id, mortgageFields(-50_000_000, sample.terms));
    const after = mortgageAccountView(sample.db, mortgage.id, asOf, {});
    expect(after.payments[0]?.interest).toBeLessThan(before.payments[0]?.interest ?? 0);
    expect(after.payments[0]?.balance).toBe(50_000_000 - (after.payments[0]?.principal ?? 0));
  } finally {
    sample.close();
  }
});

test("saving terms fixes the opening date, and leaving the terms out keeps them", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", name: "Home loan", kind: "mortgage", openingBalance: -100_000_000, ...saved });
    expect(getAccount(sample.db, mortgage.id, "2026-10-07").openingAutomatic).toBe(true);
    const withTerms = updateAccount(sample.db, mortgage.id, mortgageFields(-100_000_000, sample.terms));
    expect(withTerms.openingAutomatic).toBe(false);
    expect(withTerms.openingDate).toBe("2026-02-01");
    const kept = updateAccount(sample.db, mortgage.id, { name: "Home loan 2", ...saved });
    expect(kept.openingAutomatic).toBe(false);
    expect(kept.openingDate).toBe("2026-02-01");
    expect(sample.db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, mortgage.id)).all()).toHaveLength(1);
  } finally {
    sample.close();
  }
});

test("a patch is checked on the stored mortgage: terms need the kind mortgage and an opening date", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", ...mortgageFields(-10_000_000, sample.terms), onBudget: undefined });
    expect(() => updateAccount(sample.db, mortgage.id, { kind: "loan", ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "mortgageTerms" } }),
    );
    expect(() => updateAccount(sample.db, mortgage.id, { openingDate: "2026-01-15", ...saved })).toThrow(
      expect.objectContaining({ code: "opening_date_fixed" }),
    );
    expect(updateAccount(sample.db, mortgage.id, { kind: "loan", mortgageTerms: null, ...saved }).kind).toBe("loan");
    const undated = createAccount(sample.db, { asOf: "2026-10-07", name: "Undated", kind: "mortgage", openingBalance: -10_000_000, ...saved });
    expect(() => updateAccount(sample.db, undated.id, { mortgageTerms: sample.terms, ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "openingDate" } }),
    );
  } finally {
    sample.close();
  }
});

test("null removes the terms in the same audit transaction as the account write", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", ...mortgageFields(-100_000_000, sample.terms), onBudget: undefined });
    updateAccount(sample.db, mortgage.id, mortgageFields(-100_000_000, null));
    expect(sample.db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, mortgage.id)).all()).toHaveLength(0);
    const entries = sample.db.select().from(auditLog).where(eq(auditLog.entityId, mortgage.id)).all();
    const remove = entries.find((entry) => entry.entity === "mortgage_terms" && entry.action === "delete");
    const change = entries.find((entry) => entry.entity === "accounts" && entry.action === "update");
    expect(remove?.at).toBe(change?.at);
  } finally {
    sample.close();
  }
});

test("terms with a first payment before the opening date are not saved", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", name: "Home loan", kind: "mortgage", openingBalance: -100_000_000, ...saved });
    expect(() =>
      updateAccount(sample.db, mortgage.id, mortgageFields(-100_000_000, { ...sample.terms, firstPaymentDate: "2026-01-15" })),
    ).toThrow();
    expect(sample.db.select().from(mortgageTerms).all()).toHaveLength(0);
  } finally {
    sample.close();
  }
});

test("terms need an amount owed and a first payment after the opening date", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", name: "Home loan", kind: "mortgage", openingBalance: -100_000_000, ...saved });
    expect(() => updateAccount(sample.db, mortgage.id, mortgageFields(0, sample.terms))).toThrow();
    expect(() =>
      updateAccount(sample.db, mortgage.id, mortgageFields(-100_000_000, { ...sample.terms, firstPaymentDate: "2026-02-01" })),
    ).toThrow();
    expect(sample.db.select().from(mortgageTerms).all()).toHaveLength(0);
  } finally {
    sample.close();
  }
});

test("a mortgage with terms gets no opening balance suggestion, and the apply is refused", () => {
  const sample = book();
  try {
    const mortgage = createAccount(sample.db, { asOf: "2026-10-07", ...mortgageFields(-100_000_000, sample.terms), onBudget: undefined });
    const row = { date: "2026-04-02", amount: -5_000, balance: -90_000_000 };
    expect(importOpeningSuggestion(sample.db, mortgage.id, row)).toBeNull();
    expect(bankOpeningSuggestion(sample.db, mortgage, { date: "2026-04-02", balance: -90_000_000 }, -100_000_000)).toBeNull();
    expect(() => updateAccount(sample.db, mortgage.id, { openingBalance: -90_000_000, openingDate: "2026-04-01", ...saved })).toThrow();
    expect(getAccount(sample.db, mortgage.id, "2026-10-07").openingDate).toBe("2026-02-01");
    const plain = createAccount(sample.db, { asOf: "2026-10-07", name: "Plain", kind: "mortgage", openingBalance: -100_000_000, ...saved });
    expect(importOpeningSuggestion(sample.db, plain.id, row)).not.toBeNull();
  } finally {
    sample.close();
  }
});
