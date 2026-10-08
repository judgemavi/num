import { expect, test } from "bun:test";
import { validRulePattern, type RulePattern } from "./rule";
import { chooseTransferMatch, promotionCandidates, suggestCategorization, transferPairs, type HistoryRow, type MerchantChoice, type TransferMatchRow } from "./suggest";

const account = "account-1";
const otherAccount = "account-2";
const coffee = "category-coffee";
const groceries = "category-groceries";
const merchant = "merchant-1";

function rule(patch: Partial<RulePattern> & Pick<RulePattern, "id" | "pattern">): RulePattern {
  return {
    match: "exact",
    accountId: null,
    merchantId: merchant,
    categoryId: coffee,
    transferAccountId: null,
    priority: 0,
    archivedAt: null,
    ...patch,
  };
}

function history(id: string, date: string, categoryId: string | null, merchantId: string | null = merchant): HistoryRow {
  return { id, date, payeeRaw: "SQ *STARBUCKS", merchantId, categoryId };
}

const merchants: MerchantChoice[] = [
  { id: merchant, name: "Starbucks", defaultCategoryId: coffee, archivedAt: null },
];

test("suggestion order uses a scoped rule before a global rule", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "SQ *STARBUCKS",
    rules: [
      rule({ id: "global", pattern: "starbucks", priority: 100, categoryId: groceries }),
      rule({ id: "scoped", pattern: "STAR", match: "prefix", accountId: account, priority: 0, categoryId: coffee }),
    ],
    history: [],
    merchants: [],
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: coffee, transferAccountId: null, reason: "rule" });
});

test("a higher priority wins inside the same scope", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "STARBUCKS",
    rules: [
      rule({ id: "low", pattern: "STARBUCKS", priority: 1, categoryId: groceries }),
      rule({ id: "high", pattern: "STAR", match: "prefix", priority: 5, categoryId: coffee, merchantId: null }),
    ],
    history: [],
    merchants,
  });
  expect(result).toEqual({ merchantId: null, categoryId: coffee, transferAccountId: null, reason: "rule" });
});

test("payee history wins when 80 percent of the last 10 agree", () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, index) => history(`h${index}`, `2026-02-${String(index + 1).padStart(2, "0")}`, coffee)),
    history("h8", "2026-01-02", groceries, "merchant-2"),
    history("h9", "2026-01-01", groceries, "merchant-2"),
    history("old", "2025-01-01", groceries, "merchant-2"),
  ];
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "TST*STARBUCKS",
    rules: [],
    history: rows,
    merchants: [],
  });
  expect(result.reason).toBe("payee_history");
  expect(result.categoryId).toBe(coffee);
  expect(result.merchantId).toBe(merchant);
});

test("history below 80 percent falls through to the merchant default", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, index) => history(`h${index}`, `2026-03-${String(index + 1).padStart(2, "0")}`, coffee)),
    ...Array.from({ length: 3 }, (_, index) => history(`g${index}`, `2026-02-${String(index + 1).padStart(2, "0")}`, groceries, null)),
  ];
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "SQ *STARBUCKS",
    rules: [rule({ id: "other", pattern: "OTHER", accountId: otherAccount })],
    history: rows,
    merchants,
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: coffee, transferAccountId: null, reason: "merchant_default" });
});

test("no match returns none", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "UNKNOWN SHOP",
    rules: [rule({ id: "archived", pattern: "UNKNOWN SHOP", archivedAt: "2026-01-01T00:00:00Z" })],
    history: [history("h1", "2026-01-01", null)],
    merchants: [{ id: merchant, name: "Starbucks", defaultCategoryId: null, archivedAt: null }],
  });
  expect(result).toEqual({ merchantId: null, categoryId: null, transferAccountId: null, reason: "none" });
});

test("a rule blocks later suggestion steps", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "STARBUCKS",
    rules: [rule({ id: "only-merchant", pattern: "STARBUCKS", categoryId: null })],
    history: [history("h1", "2026-01-01", groceries)],
    merchants,
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: null, transferAccountId: null, reason: "rule" });
});

test("promote after the confirmation count when no rule covers the payee", () => {
  const rows = [1, 2, 3].map((day) => history(`c${day}`, `2026-04-0${day}`, coffee));
  expect(promotionCandidates(rows, [], 3)).toEqual([
    { payee: "STARBUCKS", merchantId: merchant, categoryId: coffee, transferAccountId: null, count: 3 },
  ]);
  expect(promotionCandidates(rows.slice(0, 2), [], 3)).toEqual([]);
  expect(promotionCandidates(rows, [rule({ id: "covers", pattern: "star", match: "prefix" })], 3)).toEqual([]);
  const split = [
    ...rows,
    history("d1", "2026-05-01", groceries, "merchant-2"),
  ];
  expect(promotionCandidates(split, [], 3).map((item) => item.categoryId)).toEqual([coffee]);
});

test("transfer pairs stay inside 90 days and use each transaction once", () => {
  const asOf = "2026-06-10";
  const pairs = transferPairs(
    [
      { id: "old-out", accountId: account, onBudget: true, date: "2026-03-11", amount: -5000, linked: false, imported: true },
      { id: "old-in", accountId: otherAccount, onBudget: true, date: "2026-03-11", amount: 5000, linked: false, imported: false },
      { id: "out", accountId: account, onBudget: true, date: "2026-06-01", amount: -2000, linked: false, imported: true },
      { id: "in-near", accountId: otherAccount, onBudget: true, date: "2026-06-03", amount: 2000, linked: false, imported: false },
      { id: "in-extra", accountId: otherAccount, onBudget: true, date: "2026-06-04", amount: 2000, linked: false, imported: true },
      { id: "wide-out", accountId: account, onBudget: true, date: "2026-06-01", amount: -800, linked: false, imported: true },
      { id: "wide-in", accountId: otherAccount, onBudget: true, date: "2026-06-05", amount: 800, linked: false, imported: true },
      { id: "off-out", accountId: "off", onBudget: false, date: "2026-06-02", amount: -100, linked: false, imported: true },
      { id: "off-in", accountId: otherAccount, onBudget: true, date: "2026-06-02", amount: 100, linked: false, imported: true },
      { id: "linked", accountId: account, onBudget: true, date: "2026-06-02", amount: -50, linked: true, imported: true },
      { id: "linked-in", accountId: otherAccount, onBudget: true, date: "2026-06-02", amount: 50, linked: false, imported: true },
    ],
    asOf,
  );
  expect(pairs).toEqual([{ leftId: "in-near", rightId: "out" }]);
});

test("a transfer pair needs one imported row", () => {
  const asOf = "2026-06-10";
  const manual = transferPairs(
    [
      { id: "out", accountId: account, onBudget: true, date: "2026-06-01", amount: -2000, linked: false, imported: false },
      { id: "in", accountId: otherAccount, onBudget: true, date: "2026-06-02", amount: 2000, linked: false, imported: false },
    ],
    asOf,
  );
  expect(manual).toEqual([]);
  const mixed = transferPairs(
    [
      { id: "out", accountId: account, onBudget: true, date: "2026-06-01", amount: -2000, linked: false, imported: true },
      { id: "in", accountId: otherAccount, onBudget: true, date: "2026-06-02", amount: 2000, linked: false, imported: false },
    ],
    asOf,
  );
  expect(mixed).toEqual([{ leftId: "in", rightId: "out" }]);
});

test("a transfer rule suggests that account and blocks a category", () => {
  const visa = "account-visa";
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "TD VISA PAYMENT",
    rules: [rule({ id: "visa", pattern: "TD VISA PAYMENT", categoryId: null, transferAccountId: visa })],
    history: [history("h1", "2026-01-01", coffee)],
    merchants,
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: null, transferAccountId: visa, reason: "rule" });
});

function matchRow(patch: Partial<TransferMatchRow> & Pick<TransferMatchRow, "id" | "date">): TransferMatchRow {
  return { amount: 5_000, lineCount: 1, reconciled: false, ...patch };
}

test("a transfer match is the closest unlinked opposite row within 3 days", () => {
  const rows = [
    matchRow({ id: "far", date: "2026-04-05" }),
    matchRow({ id: "near", date: "2026-04-02" }),
    matchRow({ id: "locked", date: "2026-04-01", reconciled: true }),
    matchRow({ id: "split", date: "2026-04-01", lineCount: 2 }),
    matchRow({ id: "same", date: "2026-04-01" }),
  ];
  expect(chooseTransferMatch(rows, { date: "2026-04-01", lineAmount: -5_000 })).toBe("same");
  expect(chooseTransferMatch([matchRow({ id: "wide", date: "2026-04-05" })], { date: "2026-04-01", lineAmount: -5_000 })).toBeNull();
});

test("promote counts a confirmed transfer", () => {
  const visa = "account-visa";
  const rows = [1, 2, 3].map((day) => ({
    ...history(`t${day}`, `2026-04-0${day}`, null),
    transferAccountId: visa,
  }));
  expect(promotionCandidates(rows, [], 3)).toEqual([
    { payee: "STARBUCKS", merchantId: merchant, categoryId: null, transferAccountId: visa, count: 3 },
  ]);
});

test("a rule pattern must contain text", () => {
  expect(validRulePattern("exact", "Starbucks")).toBe(true);
  expect(validRulePattern("contains", "   ")).toBe(false);
});
