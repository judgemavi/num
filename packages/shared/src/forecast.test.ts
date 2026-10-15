import { expect, test } from "bun:test";
import { buildForecast, forecastDayCount } from "./forecast";

test("the total of each day is the balance plus the changes up to that day", () => {
  const forecast = buildForecast({
    asOf: "2026-06-10",
    balance: 500_000,
    deltas: [
      { date: "2026-06-12", amount: -20_000 },
      { date: "2026-06-11", amount: -1_000 },
      { date: "2026-06-11", amount: -1_000 },
      // After the 90 days: not in the forecast.
      { date: "2026-09-08", amount: -9_000 },
    ],
    flows: [],
  });
  expect(forecast.dates.length).toBe(forecastDayCount);
  expect(forecast.total.slice(0, 3)).toEqual([500_000, 498_000, 478_000]);
  expect(forecast.total.at(-1)).toBe(478_000);
});
