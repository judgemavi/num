import { expect, test } from "bun:test";
import { buildForecast, forecastDayCount } from "./forecast";

test("a known change moves both series, an estimated change moves only the estimated series", () => {
  const forecast = buildForecast({
    asOf: "2026-06-10",
    balance: 500_000,
    deltas: [
      { date: "2026-06-12", amount: -20_000, series: "known" },
      { date: "2026-06-11", amount: -1_000, series: "estimated" },
      { date: "2026-06-11", amount: -1_000, series: "estimated" },
      // After the 90 days: not in the forecast.
      { date: "2026-09-08", amount: -9_000, series: "known" },
    ],
    flows: [],
  });
  expect(forecast.dates.length).toBe(forecastDayCount);
  expect(forecast.total.known.slice(0, 3)).toEqual([500_000, 500_000, 480_000]);
  expect(forecast.total.estimated.slice(0, 3)).toEqual([500_000, 498_000, 478_000]);
  expect(forecast.total.known.at(-1)).toBe(480_000);
});
