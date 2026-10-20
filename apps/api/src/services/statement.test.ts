import { readFileSync } from "node:fs";
import { join } from "node:path";
import { columnMapSchema, parseCsvStatement, parseOfxStatement, readAmount, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { loadPresets, presetsDirectory } from "./presets";

function fixture(name: string): string {
  return readFileSync(join(presetsDirectory(), "fixtures", name), "utf8");
}

const presets = loadPresets();
function preset(id: string) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Missing test preset: ${id}`);
  return found;
}

const digits = 2;

test("a statement amount reads as milliunits with the decimal places of the currency", () => {
  expect(readAmount("1500", 0, ".")).toEqual({ kind: "value", amount: 1500000 });
  expect(readAmount("10.25", 2, ".")).toEqual({ kind: "value", amount: 10250 });
  expect(readAmount("1.234", 3, ".")).toEqual({ kind: "value", amount: 1234 });
  expect(readAmount("1.234", 2, ".")).toEqual({ kind: "error", reason: "too_many_decimals" });
  expect(readAmount("1.5", 0, ".")).toEqual({ kind: "error", reason: "too_many_decimals" });
});

test("TD chequing or savings preset reads a chequing file", () => {
  const result = parseCsvStatement(fixture("td-chequing.csv"), preset("td-bank-account"), digits);
  expect(result.rows).toEqual([
    { date: "2026-01-02", description: "NORTH MARKET, UNIT 1", amount: -12500, bankId: null },
    { date: "2026-01-03", description: "PAY DEPOSIT", amount: 200000, bankId: null },
    { date: "2026-01-04", description: "CITY TRANSIT", amount: -3250, bankId: null },
  ]);
  expect(result.closingBalance).toBe(1684250);
  expect(result.closingDate).toBe("2026-01-04");
});

test("TD chequing or savings preset reads a savings file", () => {
  const result = parseCsvStatement(fixture("td-savings.csv"), preset("td-bank-account"), digits);
  expect(result.rows).toEqual([
    { date: "2026-03-15", description: "PAY DEPOSIT", amount: 50000, bankId: null },
    { date: "2026-03-16", description: "NORTH MARKET", amount: -8400, bankId: null },
  ]);
  expect(result.closingBalance).toBe(141600);
  expect(result.closingDate).toBe("2026-03-16");
});

test("TD credit card preset reads dates, signs and the closing balance", () => {
  const result = parseCsvStatement(fixture("td-credit-card.csv"), preset("td-credit-card"), digits);
  expect(result.rows).toEqual([
    { date: "2026-01-05", description: "NORTH MARKET", amount: -24000, bankId: null },
    { date: "2026-01-06", description: "CARD PAYMENT", amount: 30000, bankId: null },
  ]);
  expect(result.closingBalance).toBe(-50000);
  expect(result.closingDate).toBe("2026-01-06");
});

test("CIBC credit card preset reads dates and signs", () => {
  const result = parseCsvStatement(fixture("cibc-credit-card.csv"), preset("cibc-credit-card"), digits);
  expect(result.rows).toEqual([
    { date: "2026-02-01", description: "NORTH MARKET", amount: -15000, bankId: null },
    { date: "2026-02-02", description: "CARD PAYMENT", amount: 40000, bankId: null },
  ]);
  expect(result.closingBalance).toBeNull();
  expect(result.closingDate).toBeNull();
});

test("OFX uses FITID as the bank id and LEDGERBAL as the closing balance", () => {
  const result = parseOfxStatement(fixture("sample.ofx"), digits);
  expect(result.rows).toEqual([
    { date: "2026-02-11", description: "NORTH MARKET", amount: -12500, bankId: "SYNTH-1" },
    { date: "2026-02-12", description: "PAY DEPOSIT", amount: 200000, bankId: "SYNTH-2" },
  ]);
  expect(result.closingBalance).toBe(684250);
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
    amount: -4500,
    bankId: "SYNTH-9",
  });

  const dmy = parseCsvStatement(text, { ...map, dateOrder: "dmy" }, digits);
  expect(dmy.rows[0]?.date).toBe("2026-03-02");
  expect(dmy.rows[0]?.amount).toBe(-4500);
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
  expect(account.rows.map((row) => row.amount)).toEqual([-1250, 5000]);
  expect(account.closingBalance).toBe(8750);
  expect(account.closingDate).toBe("2026-04-02");

  const inverted = parseCsvStatement(text, { ...map, signConvention: "inverted" }, digits);
  expect(inverted.rows.map((row) => row.amount)).toEqual([1250, -5000]);
  expect(inverted.closingBalance).toBe(-8750);
  expect(inverted.closingDate).toBe("2026-04-02");
});

test("unreadable rows keep their line number and the other rows still parse", () => {
  const csv = [
    "date,description,amount,balance",
    "2026-05-01,NORTH MARKET,4.00,10.00",
    "xx/yy/2026,NORTH MARKET,1.00,9.00",
    "2026-05-02,CITY TRANSIT,nope,8.00",
    "2026-05-03,PAY DEPOSIT,1.005,7.00",
    "2026-05-04,CARD PAYMENT,100000000000000.00,4.50",
    "2026-05-05,CITY TRANSIT,-2.50,2.00",
  ].join("\n");
  const parsed = parseCsvStatement(
    csv,
    {
      hasHeader: true,
      date: 0,
      description: 1,
      amount: 2,
      balance: 3,
      dateOrder: "mdy",
      signConvention: "account",
    },
    digits,
  );
  expect(parsed.rows.map((row) => [row.date, row.amount])).toEqual([
    ["2026-05-01", 4000],
    ["2026-05-05", -2500],
  ]);
  expect(parsed.unreadable).toEqual([
    { line: 3, raw: "xx/yy/2026,NORTH MARKET,1.00,9.00", reason: "date_unreadable" },
    { line: 4, raw: "2026-05-02,CITY TRANSIT,nope,8.00", reason: "amount_unreadable" },
    { line: 5, raw: "2026-05-03,PAY DEPOSIT,1.005,7.00", reason: "too_many_decimals" },
    { line: 6, raw: "2026-05-04,CARD PAYMENT,100000000000000.00,4.50", reason: "amount_too_large" },
  ]);
  expect(parsed.closingBalance).toBe(2000);
  expect(parsed.closingDate).toBe("2026-05-05");

  const ofx = [
    "<OFX>",
    "<STMTTRN>",
    "<DTPOSTED>20260501",
    "<TRNAMT>-4.00",
    "<FITID>A",
    "<NAME>NORTH MARKET",
    "</STMTTRN>",
    "<STMTTRN>",
    "<DTPOSTED>NOTADATE",
    "<TRNAMT>-1.00",
    "<FITID>B",
    "<NAME>BAD DATE",
    "</STMTTRN>",
    "<STMTTRN>",
    "<DTPOSTED>20260502",
    "<TRNAMT>1.005",
    "<FITID>C",
    "<NAME>TOO FINE",
    "</STMTTRN>",
    "<LEDGERBAL>",
    "<BALAMT>-2.50",
    "<DTASOF>20260502",
    "</LEDGERBAL>",
    "</OFX>",
  ].join("\n");
  const ofxResult = parseOfxStatement(ofx, digits);
  expect(ofxResult.rows).toEqual([
    { date: "2026-05-01", description: "NORTH MARKET", amount: -4000, bankId: "A" },
  ]);
  expect(ofxResult.unreadable.map((row) => ({ line: row.line, reason: row.reason }))).toEqual([
    { line: 8, reason: "date_unreadable" },
    { line: 14, reason: "too_many_decimals" },
  ]);
  expect(ofxResult.closingBalance).toBe(-2500);
  expect(ofxResult.closingDate).toBe("2026-05-02");
});

test("a decimal comma reads 1.234,56 and letters around an amount are ignored", () => {
  const text = [
    "date,description,amount,balance",
    '2026-06-01,NORTH MARKET,"EUR 1.234,56","€ 2.000,00"',
    '2026-06-02,PAY DEPOSIT,"10,50","2.010,50"',
  ].join("\n");
  const result = parseCsvStatement(
    text,
    {
      hasHeader: true,
      date: 0,
      description: 1,
      amount: 2,
      balance: 3,
      dateOrder: "mdy",
      signConvention: "account",
      decimalSeparator: ",",
    },
    digits,
  );
  expect(result.rows.map((row) => row.amount)).toEqual([1234560, 10500]);
  expect(result.unreadable).toEqual([]);
  expect(result.closingBalance).toBe(2010500);
  expect(result.closingDate).toBe("2026-06-02");

  const dotted = parseCsvStatement("2026-06-03,NORTH MARKET,CAD 12.50,USD 20.00\n", {
    hasHeader: false,
    date: 0,
    description: 1,
    amount: 2,
    balance: 3,
    dateOrder: "mdy",
    signConvention: "account",
  }, digits);
  expect(dotted.rows[0]?.amount).toBe(12500);
  expect(dotted.closingBalance).toBe(20000);
});

test("a leading unicode minus is negative, and CR or DR is a sign marker", () => {
  const map = {
    hasHeader: false,
    date: 0,
    description: 1,
    amount: 2,
    balance: 3,
    dateOrder: "mdy",
    signConvention: "account",
  } as const;

  const minus = parseCsvStatement("2026-07-01,NORTH MARKET,\u221212.50,0.00\n", map, digits);
  expect(minus.rows[0]?.amount).toBe(-12500);
  expect(minus.unreadable).toEqual([]);

  const enDash = parseCsvStatement("2026-07-01,NORTH MARKET,\u201312.50,0.00\n", map, digits);
  expect(enDash.rows[0]?.amount).toBe(-12500);

  const marked = parseCsvStatement(
    ["2026-07-02,NORTH MARKET,123.45 CR,10.00", "2026-07-03,CITY TRANSIT,123.45 DR,10.00"].join("\n"),
    map,
    digits,
  );
  expect(marked.rows).toEqual([]);
  expect(marked.unreadable.map((row) => ({ line: row.line, reason: row.reason }))).toEqual([
    { line: 1, reason: "sign_marker" },
    { line: 2, reason: "sign_marker" },
  ]);

  const cad = parseCsvStatement("2026-07-04,NORTH MARKET,CAD 12.50,12.50\n", map, digits);
  expect(cad.rows[0]?.amount).toBe(12500);
  expect(cad.unreadable).toEqual([]);
});

test("auto keeps a data row and skips a header row", () => {
  const parsed = columnMapSchema.parse({
    date: 0,
    description: 1,
    debit: 2,
    credit: 3,
    balance: 4,
    dateOrder: "mdy",
    signConvention: "account",
  });
  expect(parsed.hasHeader).toBe("auto");

  const data = ['"2026-03-25",NORTH MARKET,12.50,,100.00', '"2026-03-26",PAY DEPOSIT,,4.00,104.00'].join("\n");
  const withoutHeader = parseCsvStatement(data, parsed, digits);
  expect(withoutHeader.unreadable).toEqual([]);
  expect(withoutHeader.rows.map((row) => [row.date, row.amount])).toEqual([
    ["2026-03-25", -12500],
    ["2026-03-26", 4000],
  ]);

  const withHeader = parseCsvStatement(["Date,Description,Debit,Credit,Balance", data].join("\n"), parsed, digits);
  expect(withHeader.unreadable).toEqual([]);
  expect(withHeader.rows.map((row) => row.date)).toEqual(["2026-03-25", "2026-03-26"]);
});
