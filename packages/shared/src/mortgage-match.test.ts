import { describe, expect, test } from "bun:test";
import { matchMortgageActuals } from "./mortgage-match";

const scheduled = [
  { date: "2026-01-01", payment: 1_000_000, principal: 800_000, interest: 200_000, balance: 9_000_000 },
  { date: "2026-02-01", payment: 1_000_000, principal: 810_000, interest: 190_000, balance: 8_190_000 },
  { date: "2026-03-01", payment: 1_000_000, principal: 820_000, interest: 180_000, balance: 7_370_000 },
];

describe("mortgage schedule matching", () => {
  test("places a past actual next to the nearest scheduled payment and leaves later rows empty", () => {
    const rows = matchMortgageActuals(
      scheduled,
      [{ id: "paid", date: "2026-01-03", amount: 1_000_000 }],
      "2026-02-15",
    );
    expect(rows.map((row) => row.actual?.id ?? null)).toEqual(["paid", null, null]);
    expect(rows[0]?.scheduled?.payment).toBe(1_000_000);
    expect(rows[0]?.actual?.amount).toBe(1_000_000);
  });

  test("does not give one actual to two scheduled payments", () => {
    const rows = matchMortgageActuals(
      scheduled,
      [{ id: "paid", date: "2026-01-20", amount: 1_000_000 }],
      "2026-03-15",
    );
    const matches = rows.filter((row) => row.actual !== null);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.date).toBe("2026-02-01");
  });

  test("shows an extra payment between scheduled dates as its own row", () => {
    const rows = matchMortgageActuals(
      scheduled,
      [
        { id: "paid", date: "2026-01-03", amount: 1_000_000 },
        { id: "extra", date: "2026-01-15", amount: 200_000 },
      ],
      "2026-02-15",
    );
    const extra = rows.find((row) => row.actual?.id === "extra");
    expect(extra).toEqual({ date: "2026-01-15", scheduled: null, actual: { id: "extra", date: "2026-01-15", amount: 200_000 } });
    expect(rows.map((row) => row.date)).toEqual(["2026-01-01", "2026-01-15", "2026-02-01", "2026-03-01"]);
  });
});
