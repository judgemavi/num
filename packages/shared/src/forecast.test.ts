import { expect, test } from "bun:test";
import { buildForecast, cardPaymentDay, forecastDayCount, type ForecastCard } from "./forecast";

const asOf = "2026-06-10";
const checking = "00000000-0000-4000-8000-000000000001";
const card = "00000000-0000-4000-8000-000000000002";

test("the card payment day is the median day of the payments in the last 12 months", () => {
  expect(cardPaymentDay(["2026-03-14", "2026-04-16", "2026-05-15", "2025-01-02"], asOf)).toBe(15);
  expect(cardPaymentDay(["2026-05-22"], asOf)).toBe(22);
  expect(cardPaymentDay(["2025-05-22"], asOf)).toBeNull();
  expect(cardPaymentDay([], asOf)).toBeNull();
});

function run(cardInput: Partial<ForecastCard>, start = asOf, cardBalance = -80_000) {
  return buildForecast({
    asOf: start,
    warnings: [],
    accounts: [
      { id: checking, kind: "chequing", balance: 500_000 },
      { id: card, kind: "credit_card", balance: cardBalance },
    ],
    deltas: [],
    flows: [],
    cards: [{ accountId: card, paymentAccountId: checking, policy: "full", fixedPayment: null, paymentDay: 15, ...cardInput }],
  });
}

function at(forecast: ReturnType<typeof run>, accountId: string, date: string) {
  const index = forecast.dates.indexOf(date);
  return forecast.accounts.find((row) => row.accountId === accountId)?.known[index];
}

test("a full card pays its balance on asOf on the next payment day from the payment account", () => {
  const forecast = run({});
  expect(forecast.dates.length).toBe(forecastDayCount);
  expect(at(forecast, checking, "2026-06-14")).toBe(500_000);
  expect(at(forecast, checking, "2026-06-15")).toBe(420_000);
  expect(at(forecast, card, "2026-06-15")).toBe(0);
});

test("a fixed card pays the fixed payment, capped by the balance", () => {
  expect(at(run({ policy: "fixed", fixedPayment: 30_000 }), checking, "2026-06-15")).toBe(470_000);
  expect(at(run({ policy: "fixed", fixedPayment: 300_000 }), checking, "2026-06-15")).toBe(420_000);
});

test("a manual card, or a card with no payment day, has no payment", () => {
  expect(at(run({ policy: "manual" }), checking, "2026-07-20")).toBe(500_000);
  expect(at(run({ paymentDay: null }), checking, "2026-07-20")).toBe(500_000);
});

test("the payment day moves to the last day of a short month", () => {
  expect(at(run({ paymentDay: 31 }, "2026-02-10"), checking, "2026-02-28")).toBe(420_000);
});
