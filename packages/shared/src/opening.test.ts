import { expect, test } from "bun:test";
import { storedStatementBalance } from "./checkpoint";
import { openingFromFirstRow, reconcileOpening } from "./opening";

test("the opening suggestion from the first row follows account sign", () => {
  expect(openingFromFirstRow({ balance: 1_487_500, amount: -12_500, date: "2026-01-02" })).toEqual({
    amount: 1_500_000,
    date: "2026-01-01",
  });

  const cardBalance = storedStatementBalance("credit_card", 80_000);
  expect(openingFromFirstRow({ balance: cardBalance, amount: -24_000, date: "2026-01-05" })).toEqual({
    amount: -56_000,
    date: "2026-01-04",
  });
});

test("a reconcile suggestion makes the statement balance and is absent after a checkpoint", () => {
  expect(
    reconcileOpening({
      hasCheckpoint: false,
      openingBalance: 10_000,
      calculatedBalance: 5000,
      statementBalance: 4000,
      date: "2026-01-31",
    }),
  ).toEqual({ amount: 9000, date: "2026-01-31" });

  expect(
    reconcileOpening({
      hasCheckpoint: false,
      openingBalance: 0,
      calculatedBalance: 4000,
      statementBalance: 4000,
      date: "2026-01-31",
    }),
  ).toBeNull();

  expect(
    reconcileOpening({
      hasCheckpoint: true,
      openingBalance: 10_000,
      calculatedBalance: 5000,
      statementBalance: 4000,
      date: "2026-01-31",
    }),
  ).toBeNull();
});
