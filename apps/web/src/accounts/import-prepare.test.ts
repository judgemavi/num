import { columnMapSchema, presetSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { dateRange, readStatement } from "./import-prepare";

const text = "date,description,amount\n03/31/2026,LAST SHOP,-7.50\n03/03/2026,FIRST SHOP,-2.00\n";
const map = columnMapSchema.parse({ hasHeader: true, date: 0, description: 1, amount: 2, dateOrder: "mdy", signConvention: "inverted" });
const preset = presetSchema.parse({ id: "bank", name: "Bank", dateFormat: "mdy", hasHeader: true, date: 0, description: 1, amount: 2, dateOrder: "mdy", signConvention: "account" });

function account(patch: Partial<Parameters<typeof readStatement>[3] & object>) {
  return { importPreset: null, columnMap: null, ...patch };
}

test("the sample follows the format, then the file's map, then the account's map or preset", () => {
  const fromPreset = readStatement(text, { kind: "preset", presetId: "bank" }, null, null, [preset], 2);
  expect(fromPreset?.rows.map((row) => row.amount)).toEqual([-7500, -2000]);

  const fromMap = readStatement(text, { kind: "unknown" }, map, account({ importPreset: "bank" }), [preset], 2);
  expect(fromMap?.rows.map((row) => row.amount)).toEqual([7500, 2000]);

  const fromAccountMap = readStatement(text, { kind: "unknown" }, null, account({ columnMap: map }), [preset], 2);
  expect(fromAccountMap?.rows[0]?.amount).toBe(7500);

  const fromAccountPreset = readStatement(text, { kind: "unknown" }, null, account({ importPreset: "bank" }), [preset], 2);
  expect(fromAccountPreset?.rows[0]?.amount).toBe(-7500);

  expect(readStatement(text, { kind: "unknown" }, null, account({}), [preset], 2)).toBeNull();
  expect(readStatement(text, { kind: "ofx" }, null, null, [preset], 2)).toBeNull();
  expect(readStatement("", { kind: "preset", presetId: "bank" }, null, null, [preset], 2)).toBeNull();
});

test("the date range is the earliest and the latest row date, not the file order", () => {
  const statement = readStatement(text, { kind: "preset", presetId: "bank" }, null, null, [preset], 2);
  expect(statement && dateRange(statement)).toEqual({ first: "2026-03-03", last: "2026-03-31" });
});
