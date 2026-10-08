import { expect, test } from "bun:test";
import { validRulePattern, type RulePattern } from "./rule";
import { promotionCandidates, suggestCategorization, transferPairs, type HistoryRow, type MerchantChoice } from "./suggest";

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
    priority: 0,
    archivedAt: null,
    ...patch,
  };
}

function history(id: string, date: string, categoryId: string | null, merchantId: string | null = merchant): HistoryRow {
  return { id, date, payeeRaw: "SQ *STARBUCKS TORONTO ON", merchantId, categoryId };
}

const merchants: MerchantChoice[] = [
  { id: merchant, name: "Starbucks", defaultCategoryId: coffee, archivedAt: null },
];

test("suggestion order uses a scoped rule before a global rule", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "SQ *STARBUCKS #12 TORONTO ON",
    rules: [
      rule({ id: "global", pattern: "starbucks", priority: 100, categoryId: groceries }),
      rule({ id: "scoped", pattern: "STAR", match: "prefix", accountId: account, priority: 0, categoryId: coffee }),
    ],
    history: [],
    merchants: [],
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: coffee, reason: "rule" });
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
  expect(result).toEqual({ merchantId: null, categoryId: coffee, reason: "rule" });
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
    rawPayee: "TST*STARBUCKS OTTAWA ON",
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
    rawPayee: "SQ *STARBUCKS TORONTO ON",
    rules: [rule({ id: "other", pattern: "OTHER", accountId: otherAccount })],
    history: rows,
    merchants,
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: coffee, reason: "merchant_default" });
});

test("no match returns none", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "UNKNOWN SHOP",
    rules: [rule({ id: "archived", pattern: "UNKNOWN SHOP", archivedAt: "2026-01-01T00:00:00Z" })],
    history: [history("h1", "2026-01-01", null)],
    merchants: [{ id: merchant, name: "Starbucks", defaultCategoryId: null, archivedAt: null }],
  });
  expect(result).toEqual({ merchantId: null, categoryId: null, reason: "none" });
});

test("a rule blocks later suggestion steps", () => {
  const result = suggestCategorization({
    accountId: account,
    rawPayee: "STARBUCKS",
    rules: [rule({ id: "only-merchant", pattern: "STARBUCKS", categoryId: null })],
    history: [history("h1", "2026-01-01", groceries)],
    merchants,
  });
  expect(result).toEqual({ merchantId: merchant, categoryId: null, reason: "rule" });
});

test("promote after the confirmation count when no rule covers the payee", () => {
  const rows = [1, 2, 3].map((day) => history(`c${day}`, `2026-04-0${day}`, coffee));
  expect(promotionCandidates(rows, [], 3)).toEqual([
    { payee: "STARBUCKS", merchantId: merchant, categoryId: coffee, count: 3 },
  ]);
  expect(promotionCandidates(rows.slice(0, 2), [], 3)).toEqual([]);
  expect(promotionCandidates(rows, [rule({ id: "covers", pattern: "star", match: "prefix" })], 3)).toEqual([]);
  const split = [
    ...rows,
    history("d1", "2026-05-01", groceries, "merchant-2"),
  ];
  expect(promotionCandidates(split, [], 3).map((item) => item.categoryId)).toEqual([coffee]);
});

test("transfer pairs are opposite amounts in two on-budget accounts within 3 days", () => {
  const pairs = transferPairs([
    { id: "a", accountId: account, onBudget: true, date: "2026-01-01", amount: -5000, linked: false },
    { id: "b", accountId: otherAccount, onBudget: true, date: "2026-01-03", amount: 5000, linked: false },
    { id: "c", accountId: account, onBudget: true, date: "2026-02-01", amount: -800, linked: false },
    { id: "d", accountId: otherAccount, onBudget: true, date: "2026-02-05", amount: 800, linked: false },
    { id: "e", accountId: "off", onBudget: false, date: "2026-03-01", amount: -100, linked: false },
    { id: "f", accountId: otherAccount, onBudget: true, date: "2026-03-01", amount: 100, linked: false },
    { id: "g", accountId: account, onBudget: true, date: "2026-04-01", amount: -100, linked: true },
    { id: "h", accountId: otherAccount, onBudget: true, date: "2026-04-01", amount: 100, linked: false },
    { id: "i", accountId: account, onBudget: true, date: "2026-05-01", amount: -50, linked: false },
    { id: "j", accountId: account, onBudget: true, date: "2026-05-01", amount: 50, linked: false },
    { id: "k", accountId: account, onBudget: true, date: "2026-06-01", amount: -20, linked: false },
    { id: "near", accountId: otherAccount, onBudget: true, date: "2026-06-01", amount: 20, linked: false },
    { id: "far", accountId: otherAccount, onBudget: true, date: "2026-06-03", amount: 20, linked: false },
  ]);
  expect(pairs).toEqual([
    { leftId: "a", rightId: "b" },
    { leftId: "k", rightId: "near" },
  ]);
});

test("regex patterns are checked before save", () => {
  expect(validRulePattern("regex", "(")).toBe(false);
  expect(validRulePattern("regex", "")).toBe(false);
  expect(validRulePattern("regex", "^STAR.+")).toBe(true);
  expect(validRulePattern("exact", "Starbucks")).toBe(true);
  expect(validRulePattern("contains", "   ")).toBe(false);
});
