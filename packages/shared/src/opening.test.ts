import { expect, test } from "bun:test";
import { storedBankBalance } from "./bank-balance";
import { openingFromFirstRow, openingFromBankBalance } from "./opening";

test("the opening suggestion from the first row follows account sign", () => {
  expect(openingFromFirstRow({ balance: 1_487_500, amount: -12_500, date: "2026-01-02" })).toEqual({
    amount: 1_500_000,
    date: "2026-01-01",
  });

  const cardBalance = storedBankBalance("credit_card", 80_000);
  expect(openingFromFirstRow({ balance: cardBalance, amount: -24_000, date: "2026-01-05" })).toEqual({
    amount: -56_000,
    date: "2026-01-04",
  });
});

test("the bank balance suggestion makes the bank balance and is absent after a matching bank balance", () => {
  expect(
    openingFromBankBalance({
      hasMatchingBankBalance: false,
      openingBalance: 10_000,
      clearedBalance: 5000,
      bankBalance: 4000,
      date: "2026-01-31",
    }),
  ).toEqual({ amount: 9000, date: "2026-01-31" });

  expect(
    openingFromBankBalance({
      hasMatchingBankBalance: false,
      openingBalance: 0,
      clearedBalance: 4000,
      bankBalance: 4000,
      date: "2026-01-31",
    }),
  ).toBeNull();

  expect(
    openingFromBankBalance({
      hasMatchingBankBalance: true,
      openingBalance: 10_000,
      clearedBalance: 5000,
      bankBalance: 4000,
      date: "2026-01-31",
    }),
  ).toBeNull();
});
