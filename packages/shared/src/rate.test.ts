import { expect, test } from "bun:test";
import { milliPctToPercent, percentToMilliPct } from "./rate";

test("percent text converts to and from MilliPct", () => {
  expect(percentToMilliPct("6.875")).toBe(6875);
  expect(milliPctToPercent(6875)).toBe("6.875");
  expect(percentToMilliPct("0")).toBe(0);
  expect(milliPctToPercent(0)).toBe("0");
  expect(percentToMilliPct("1000")).toBe(1_000_000);
  expect(milliPctToPercent(1_000_000)).toBe("1000");
  expect(percentToMilliPct("4.84")).toBe(4840);
  expect(milliPctToPercent(4840)).toBe("4.84");

  expect(() => percentToMilliPct("6.8751")).toThrow("Interest rate has too many decimal places");
  expect(() => percentToMilliPct("1000.001")).toThrow("Interest rate is too high");
});
