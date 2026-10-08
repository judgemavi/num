import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { parseCsvStatement } from "./parse-csv";
import { parseOfxStatement } from "./parse-ofx";
import { loadPreset, presetsDirectory } from "./presets";

function fixture(name: string): string {
  return readFileSync(join(presetsDirectory(), "fixtures", name), "utf8");
}

const digits = 2;

test("TD chequing preset reads dates, signs and the closing balance", () => {
  const result = parseCsvStatement(fixture("td-chequing.csv"), loadPreset("td-chequing"), digits);
  expect(result.rows).toEqual([
    { date: "2026-01-02", description: "NORTH MARKET, UNIT 1", amount: -1250, bankId: null },
    { date: "2026-01-03", description: "PAY DEPOSIT", amount: 20000, bankId: null },
    { date: "2026-01-04", description: "CITY TRANSIT", amount: -325, bankId: null },
  ]);
  expect(result.closingBalance).toBe(168425);
  expect(result.closingDate).toBe("2026-01-04");
});

test("TD savings preset reads dates, signs and the closing balance", () => {
  const result = parseCsvStatement(fixture("td-savings.csv"), loadPreset("td-savings"), digits);
  expect(result.rows).toEqual([
    { date: "2026-03-15", description: "PAY DEPOSIT", amount: 5000, bankId: null },
    { date: "2026-03-16", description: "NORTH MARKET", amount: -840, bankId: null },
  ]);
  expect(result.closingBalance).toBe(14160);
  expect(result.closingDate).toBe("2026-03-16");
});

test("TD credit card preset reads dates, signs and the closing balance", () => {
  const result = parseCsvStatement(fixture("td-credit-card.csv"), loadPreset("td-credit-card"), digits);
  expect(result.rows).toEqual([
    { date: "2026-01-05", description: "NORTH MARKET", amount: -2400, bankId: null },
    { date: "2026-01-06", description: "CARD PAYMENT", amount: 3000, bankId: null },
  ]);
  expect(result.closingBalance).toBe(-5000);
  expect(result.closingDate).toBe("2026-01-06");
});

test("CIBC credit card preset reads dates and signs", () => {
  const result = parseCsvStatement(fixture("cibc-credit-card.csv"), loadPreset("cibc-credit-card"), digits);
  expect(result.rows).toEqual([
    { date: "2026-02-01", description: "NORTH MARKET", amount: -1500, bankId: null },
    { date: "2026-02-02", description: "CARD PAYMENT", amount: 4000, bankId: null },
  ]);
  expect(result.closingBalance).toBeNull();
  expect(result.closingDate).toBeNull();
});

test("OFX uses FITID as the bank id and LEDGERBAL as the closing balance", () => {
  const result = parseOfxStatement(fixture("sample.ofx"), digits);
  expect(result.rows).toEqual([
    { date: "2026-02-11", description: "NORTH MARKET", amount: -1250, bankId: "SYNTH-1" },
    { date: "2026-02-12", description: "PAY DEPOSIT", amount: 20000, bankId: "SYNTH-2" },
  ]);
  expect(result.closingBalance).toBe(68425);
  expect(result.closingDate).toBe("2026-02-12");
});

test("date order DMY and MDY read an ambiguous date", () => {
  const text = "02/03/2026,NORTH MARKET,-4.50,10.00,SYNTH-9\n";
  const map = {
    hasHeader: false,
    date: 0,
    description: 1,
    amount: 2,
    balance: 3,
    bankId: 4,
    signConvention: "account",
  } satisfies Omit<ColumnMap, "dateOrder">;

  const mdy = parseCsvStatement(text, { ...map, dateOrder: "mdy" }, digits);
  expect(mdy.rows[0]).toEqual({
    date: "2026-02-03",
    description: "NORTH MARKET",
    amount: -450,
    bankId: "SYNTH-9",
  });

  const dmy = parseCsvStatement(text, { ...map, dateOrder: "dmy" }, digits);
  expect(dmy.rows[0]?.date).toBe("2026-03-02");
  expect(dmy.rows[0]?.amount).toBe(-450);
});

test("both sign conventions set the amount and the closing balance", () => {
  const text = ["2026-04-02,CITY TRANSIT,-1.25,8.75", "2026-04-01,NORTH MARKET,5.00,10.00"].join("\n");
  const map = {
    hasHeader: false,
    date: 0,
    description: 1,
    amount: 2,
    balance: 3,
    dateOrder: "mdy",
  } satisfies Omit<ColumnMap, "signConvention">;

  const account = parseCsvStatement(text, { ...map, signConvention: "account" }, digits);
  expect(account.rows.map((row) => row.amount)).toEqual([-125, 500]);
  expect(account.closingBalance).toBe(875);
  expect(account.closingDate).toBe("2026-04-02");

  const inverted = parseCsvStatement(text, { ...map, signConvention: "inverted" }, digits);
  expect(inverted.rows.map((row) => row.amount)).toEqual([125, -500]);
  expect(inverted.closingBalance).toBe(-875);
  expect(inverted.closingDate).toBe("2026-04-02");
});
