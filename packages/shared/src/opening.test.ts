import { expect, test } from "bun:test";
import { storedStatementBalance } from "./checkpoint";
import { openingFromFirstRow, reconcileOpening } from "./opening";

test("the opening suggestion from the first row follows account sign", () => {
  expect(openingFromFirstRow({ balance: 148_750, amount: -1_250, date: "2026-01-02" })).toEqual({
    amount: 150_000,
    date: "2026-01-01",
  });

  const cardBalance = storedStatementBalance("credit_card", 8_000);
  expect(openingFromFirstRow({ balance: cardBalance, amount: -2_400, date: "2026-01-05" })).toEqual({
    amount: -5_600,
    date: "2026-01-04",
  });
});

test("a reconcile suggestion makes the statement balance and is absent after a checkpoint", () => {
  expect(
    reconcileOpening({
      hasCheckpoint: false,
      openingBalance: 1_000,
      calculatedBalance: 500,
      statementBalance: 400,
      date: "2026-01-31",
    }),
  ).toEqual({ amount: 900, date: "2026-01-31" });

  expect(
    reconcileOpening({
      hasCheckpoint: false,
      openingBalance: 0,
      calculatedBalance: 400,
      statementBalance: 400,
      date: "2026-01-31",
    }),
  ).toBeNull();

  expect(
    reconcileOpening({
      hasCheckpoint: true,
      openingBalance: 1_000,
      calculatedBalance: 500,
      statementBalance: 400,
      date: "2026-01-31",
    }),
  ).toBeNull();
});
