import { expect, test } from "bun:test";
import { valuationSchema } from "@num/shared";
import { valuationBody } from "./valuation-values";

const value = { date: "2026-02-01", amount: "12.34", note: "" };
const saved = valuationSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  accountId: "00000000-0000-4000-8000-000000000002",
  date: value.date, balance: -12_345, note: null,
});

test("valuation entry uses a positive amount owed and sends a signed balance", () => {
  for (const kind of ["mortgage", "loan"] as const) {
    expect(valuationBody("USD", kind, value, null)?.body.balance).toBe(-12_340);
    expect(valuationBody("USD", kind, { ...value, amount: "0" }, null)?.body.balance).toBe(0);
  }
  expect(valuationBody("USD", "investment", value, null)?.body.balance).toBe(12_340);
});

test("a valuation note change keeps stored precision and sends only the note", () => {
  const unchanged = { ...value, amount: "12.345" };
  expect(valuationBody("USD", "mortgage", unchanged, saved)?.patch).toBeNull();
  expect(valuationBody("USD", "mortgage", { ...unchanged, note: "Updated" }, saved)?.patch).toEqual({ note: "Updated" });
  expect(valuationBody("USD", "mortgage", { ...value, amount: "10.00" }, saved)?.patch).toEqual({ balance: -10_000 });
  expect(valuationBody("USD", "mortgage", unchanged, null)).toBeNull();
});
