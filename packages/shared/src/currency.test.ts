import { expect, test } from "bun:test";
import { currencyMinorUnits } from "./currency-units";
import { amountText, currencyDigits, currencyStep, divideAmount, floorToStep, isWholeAmount, parseAmount, roundToStep } from "./currency";

test("each currency has a maximum of 3 minor-unit digits, thus each real amount is a whole number of milliunits", () => {
  expect(Object.values(currencyMinorUnits).every((digits) => digits <= 3)).toBe(true);
});

test("the step is the milliunits in one minor unit: JPY 1000, CAD 10, KWD 1", () => {
  expect(currencyDigits("JPY")).toBe(0);
  expect(currencyDigits("CAD")).toBe(2);
  expect(currencyDigits("KWD")).toBe(3);
  expect(currencyStep("JPY")).toBe(1000);
  expect(currencyStep("CAD")).toBe(10);
  expect(currencyStep("KWD")).toBe(1);
  expect(() => currencyStep("XYZ")).toThrow("Unknown currency");
});

test("typed text becomes milliunits exactly, and more decimal places than the currency has is an error", () => {
  expect(parseAmount("JPY", "1500")).toBe(1_500_000);
  expect(parseAmount("CAD", "10.25")).toBe(10_250);
  expect(parseAmount("CAD", "1.5")).toBe(1_500);
  expect(parseAmount("CAD", "-0.01")).toBe(-10);
  expect(parseAmount("CAD", "0.07")).toBe(70);
  expect(parseAmount("KWD", "1.234")).toBe(1_234);
  expect(parseAmount("KWD", "1.5")).toBe(1_500);

  expect(() => parseAmount("JPY", "1.5")).toThrow("Amount has too many decimal places");
  expect(() => parseAmount("CAD", "1.234")).toThrow("Amount has too many decimal places");
});

test("the text of an amount is exact and has no zeros at the end of the fraction", () => {
  expect(amountText(12_340)).toBe("12.34");
  expect(amountText(1_500_000)).toBe("1500");
  expect(amountText(1_234)).toBe("1.234");
  expect(amountText(-10)).toBe("-0.01");
  expect(amountText(0)).toBe("0");
});

test("an amount is whole when the currency can hold it", () => {
  expect(isWholeAmount(12_340, 10)).toBe(true);
  expect(isWholeAmount(12_345, 10)).toBe(false);
  expect(isWholeAmount(1_000, 1000)).toBe(true);
  expect(isWholeAmount(1_500, 1000)).toBe(false);
  expect(isWholeAmount(1_234, 1)).toBe(true);
});

test("a calculated amount rounds to the minor unit, and a half goes away from zero", () => {
  expect(roundToStep(12_345, 10)).toBe(12_350);
  expect(roundToStep(-12_345, 10)).toBe(-12_350);
  expect(roundToStep(12_344.9, 10)).toBe(12_340);
  expect(roundToStep(1_499, 1000)).toBe(1_000);
  expect(roundToStep(1_500, 1000)).toBe(2_000);
  expect(roundToStep(-4, 10)).toBe(0);
  expect(Object.is(roundToStep(-4, 10), -0)).toBe(false);
  expect(floorToStep(12_349, 10)).toBe(12_340);
  expect(floorToStep(-12_341, 10)).toBe(-12_350);
});

test("a division gives whole minor units with integer math", () => {
  expect(divideAmount(100_000, 3, 10)).toBe(33_330);
  expect(divideAmount(100_000, 3, 10, "up")).toBe(33_340);
  expect(divideAmount(100_000, 3, 10, "down")).toBe(33_330);
  expect(divideAmount(-100_000, 3, 10, "up")).toBe(-33_330);
  expect(divideAmount(-100_000, 3, 10, "down")).toBe(-33_340);
  expect(divideAmount(15, 2, 10)).toBe(10);
  expect(divideAmount(-15, 2, 10)).toBe(-10);
  expect(divideAmount(5_000_000, 3, 1000)).toBe(1_667_000);
  expect(divideAmount(12_000, 12, 10)).toBe(1_000);
  expect(() => divideAmount(100, 0, 10)).toThrow();
});
