import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, valuations } from "@num/db";
import { mortgageSplitForDate, mortgageViewSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { mortgageAccountView } from "./mortgage";
import { suggestForPayee } from "./suggestions";
import { listNeedsReview } from "./needs-review";
import { approveSelected } from "./review-approve";
import { createTransaction, getTransaction } from "./transactions";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-09-01";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-mortgage-learn-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, { asOf: "2026-10-07", name: "Everyday", institution: null, kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const interest = createCategory(db, { name: "Interest", kind: "expense", ...saved });
  const other = createCategory(db, { name: "Fees", kind: "expense", ...saved });
  const terms = {
    rateMilliPct: 5000,
    compounding: "semiannual" as const,
    paymentAmount: 581_600,
    paymentFrequency: "monthly" as const,
    firstPaymentDate: "2026-03-01",
    termEnd: "2031-03-01",
    amortizationMonthsRemaining: 300,
    paymentAccountId: account.id,
    interestCategoryId: interest.id,
    propertyAccountId: null,
  };
  const mortgage = createAccount(db, {
    asOf: "2026-10-07",
    name: "Strive Mortgage",
    institution: null,
    kind: "mortgage",
    openingDate: "2026-02-01",
    openingBalance: -100_000_000,
    mortgageTerms: terms,
    ...saved,
  });
  return {
    db,
    account,
    interest,
    other,
    mortgage,
    terms: { ...terms, accountId: mortgage.id },
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

type Sample = ReturnType<typeof book>;

function interestOn(sample: Sample, date: string): number {
  const split = mortgageSplitForDate({
    terms: sample.terms,
    opening: { balance: sample.mortgage.openingBalance, date: sample.mortgage.openingDate },
    valuations: sample.db.select({ date: valuations.date, balance: valuations.balance }).from(valuations).all(),
    date,
    fromAccountId: sample.account.id,
    toAccountId: sample.mortgage.id,
    step: 10,
  });
  if (!split) {
    throw new Error("Schedule row is missing");
  }
  return split.interest;
}

function open(db: Db, accountId: string, date: string, amount: number) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "STRIVE MTG",
    lines: [{ amount, categoryId: null, memo: null, transferAccountId: null, tagIds: [] }],
    ...saved,
  });
}

/** The user saves a payment as an interest line and a transfer line. */
function confirmSplit(sample: Sample, date: string, amount: number, interestCategoryId = sample.interest.id) {
  const interest = interestOn(sample, date);
  return createTransaction(sample.db, {
    accountId: sample.account.id,
    date,
    amount,
    payeeRaw: "STRIVE MTG",
    lines: [
      { amount: -interest, categoryId: interestCategoryId, memo: null, transferAccountId: null, tagIds: [] },
      { amount: amount + interest, categoryId: null, memo: null, transferAccountId: sample.mortgage.id, tagIds: [] },
    ],
    ...saved,
  });
}

function reviewOf(db: Db, id: string) {
  return listNeedsReview(db, asOf).find((hit) => hit.id === id)?.review;
}

function shape(db: Db, id: string) {
  return getTransaction(db, id)?.lines.map((line) => ({ amount: line.amount, categoryId: line.categoryId, to: line.transferAccountId })) ?? [];
}

test("a confirmed mortgage payment makes the other rows of the payee Likely, never Sure", () => {
  const sample = book();
  try {
    const next = open(sample.db, sample.account.id, "2026-04-01", -581_600);
    expect(reviewOf(sample.db, next.id)?.suggestion).toBeNull();
    confirmSplit(sample, "2026-03-01", -581_600);
    const review = reviewOf(sample.db, next.id);
    expect(review?.level).toBe("likely");
    expect(review?.suggestion?.mortgage).toBe(true);
    expect(review?.suggestion?.transferAccountId).toBe(sample.mortgage.id);
    expect(getTransaction(sample.db, next.id)?.autoReason).toBeNull();
  } finally {
    sample.close();
  }
});

test("Yes writes the split for the date and amount of each row", () => {
  const sample = book();
  try {
    confirmSplit(sample, "2026-03-01", -581_600);
    const april = open(sample.db, sample.account.id, "2026-04-01", -581_600);
    const may = open(sample.db, sample.account.id, "2026-05-01", -600_000);
    for (const row of [april, may]) {
      const suggestion = reviewOf(sample.db, row.id)?.suggestion;
      expect(suggestion?.mortgage).toBe(true);
      expect(approveSelected(sample.db, asOf, [row.id], saved)).toEqual({ approved: 1, skipped: [] });
    }
    const aprilInterest = interestOn(sample, "2026-04-01");
    const mayInterest = interestOn(sample, "2026-05-01");
    expect(shape(sample.db, april.id)).toEqual([
      { amount: -aprilInterest, categoryId: sample.interest.id, to: null },
      { amount: -581_600 + aprilInterest, categoryId: null, to: sample.mortgage.id },
    ]);
    expect(shape(sample.db, may.id)).toEqual([
      { amount: -mayInterest, categoryId: sample.interest.id, to: null },
      { amount: -600_000 + mayInterest, categoryId: null, to: sample.mortgage.id },
    ]);
    expect(getTransaction(sample.db, april.id)?.autoReason).toBeNull();
  } finally {
    sample.close();
  }
});

test("Approve writes each date's own interest", () => {
  const sample = book();
  try {
    confirmSplit(sample, "2026-03-01", -581_600);
    const dates = ["2026-04-01", "2026-05-01", "2026-06-01"];
    const rows = dates.map((date) => open(sample.db, sample.account.id, date, -581_600));
    const result = approveSelected(sample.db, asOf, rows.map((row) => row.id), saved);
    expect(result.approved).toBe(3);
    const interests = dates.map((date) => interestOn(sample, date));
    expect(new Set(interests).size).toBeGreaterThan(1);
    rows.forEach((row, index) => {
      expect(shape(sample.db, row.id)[0]?.amount).toBe(-(interests[index] ?? 0));
      expect(shape(sample.db, row.id)[1]).toEqual({ amount: -581_600 + (interests[index] ?? 0), categoryId: null, to: sample.mortgage.id });
    });
  } finally {
    sample.close();
  }
});

test("a date with no schedule row has no suggestion", () => {
  const sample = book();
  try {
    confirmSplit(sample, "2026-03-01", -581_600);
    const early = open(sample.db, sample.account.id, "2026-02-01", -581_600);
    expect(reviewOf(sample.db, early.id)?.suggestion).toBeNull();
  } finally {
    sample.close();
  }
});

test("a split that is not a mortgage payment teaches nothing", () => {
  const sample = book();
  try {
    const wrongCategory = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -581_600,
      payeeRaw: "STRIVE MTG",
      lines: [
        { amount: -10_000, categoryId: sample.other.id, memo: null, transferAccountId: null, tagIds: [] },
        { amount: -571_600, categoryId: null, memo: null, transferAccountId: sample.mortgage.id, tagIds: [] },
      ],
      ...saved,
    });
    const next = open(sample.db, sample.account.id, "2026-04-01", -581_600);
    expect(wrongCategory.lines).toHaveLength(2);
    expect(reviewOf(sample.db, next.id)?.suggestion).toBeNull();
  } finally {
    sample.close();
  }
});

test("the editor suggestion with a date is the mortgage suggestion of the Review column", () => {
  const sample = book();
  try {
    confirmSplit(sample, "2026-03-01", -581_600);
    const withDate = suggestForPayee(sample.db, sample.account.id, "STRIVE MTG", -581_600, "2026-04-01");
    expect(withDate.mortgage).toBe(true);
    expect(withDate.transferAccountId).toBe(sample.mortgage.id);
    expect(withDate.level).toBe("likely");
    expect(suggestForPayee(sample.db, sample.account.id, "STRIVE MTG", -581_600).mortgage).toBe(false);
    expect(suggestForPayee(sample.db, sample.account.id, "STRIVE MTG", -581_600, "2026-02-01").reason).toBe("none");
  } finally {
    sample.close();
  }
});

test("the mortgage view gives a negative balance that the view schema accepts", () => {
  const sample = book();
  try {
    const view = mortgageAccountView(sample.db, sample.mortgage.id, asOf, {});
    expect(view.balance).toBe(-100_000_000);
    expect(mortgageViewSchema.safeParse(view).success).toBe(true);
  } finally {
    sample.close();
  }
});

test("conflicting mortgage answers still give a Likely suggestion and review level", () => {
  const sample = book();
  try {
    confirmSplit(sample, "2026-03-01", -581_600);
    const otherMortgage = createAccount(sample.db, {
      asOf, name: "Other mortgage", kind: "mortgage", openingDate: "2026-02-01", openingBalance: -100_000_000,
      mortgageTerms: sample.terms, ...saved,
    });
    const interest = interestOn(sample, "2026-04-01");
    createTransaction(sample.db, {
      accountId: sample.account.id, date: "2026-04-01", amount: -581_600, payeeRaw: "STRIVE MTG",
      lines: [
        { amount: -interest, categoryId: sample.interest.id },
        { amount: -581_600 + interest, transferAccountId: otherMortgage.id },
      ], ...saved,
    });
    const next = open(sample.db, sample.account.id, "2026-05-01", -581_600);
    const review = reviewOf(sample.db, next.id);
    expect(review?.suggestion).toMatchObject({ mortgage: true, level: "likely" });
    expect(review?.suggestion?.confidence).toBeLessThan(750);
    expect(review?.level).toBe("likely");
  } finally {
    sample.close();
  }
});
