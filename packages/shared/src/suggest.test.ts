import { expect, test } from "bun:test";
import { chooseTransferMatch, transferPairs, type TransferMatchRow } from "./suggest";

const account = "account-1";
const otherAccount = "account-2";

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

