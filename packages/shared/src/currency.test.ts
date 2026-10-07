import { expect, test } from "bun:test";
import { minorUnitDigits, toMinorUnits } from "./currency";

test("minor-unit conversion follows ISO 4217 for JPY, CAD and KWD", () => {
  expect(minorUnitDigits("JPY")).toBe(0);
  expect(minorUnitDigits("CAD")).toBe(2);
  expect(minorUnitDigits("KWD")).toBe(3);

  expect(toMinorUnits("JPY", "1500")).toBe(1500);
  expect(toMinorUnits("CAD", "10.25")).toBe(1025);
  expect(toMinorUnits("CAD", "1.5")).toBe(150);
  expect(toMinorUnits("CAD", "-0.01")).toBe(-1);
  expect(toMinorUnits("KWD", "1.234")).toBe(1234);
  expect(toMinorUnits("KWD", "1.5")).toBe(1500);

  expect(() => toMinorUnits("JPY", "1.5")).toThrow("Amount has too many decimal places");
});
