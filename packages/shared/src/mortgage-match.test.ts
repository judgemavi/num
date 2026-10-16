import { describe, expect, test } from "bun:test";
import { clampMortgageYear, matchMortgageActuals, mortgageRowsOfYear, mortgageScheduleYears } from "./mortgage-match";

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

describe("mortgage schedule years", () => {
  const crossYear = [
    { date: "2026-12-31", payment: 1_000_000, principal: 800_000, interest: 200_000, balance: 9_000_000 },
    { date: "2027-01-31", payment: 1_000_000, principal: 810_000, interest: 190_000, balance: 8_190_000 },
  ];

  test("a payment early in January matches the scheduled payment of December 31", () => {
    const rows = matchMortgageActuals(crossYear, [{ id: "paid", date: "2027-01-02", amount: 1_000_000 }], "2027-02-15");
    expect(mortgageScheduleYears(rows)).toEqual({ first: 2026, last: 2027 });
    expect(mortgageRowsOfYear(rows, 2026).map((row) => row.actual?.id ?? null)).toEqual(["paid"]);
    expect(mortgageRowsOfYear(rows, 2027).map((row) => row.actual?.id ?? null)).toEqual([null]);
  });

  test("an actual payment that matches no scheduled payment extends the range", () => {
    const rows = matchMortgageActuals(
      crossYear,
      [
        { id: "paid", date: "2026-12-31", amount: 1_000_000 },
        { id: "early", date: "2025-06-01", amount: 300_000 },
      ],
      "2027-02-15",
    );
    expect(mortgageScheduleYears(rows)).toEqual({ first: 2025, last: 2027 });
    expect(mortgageRowsOfYear(rows, 2025)).toEqual([{ date: "2025-06-01", scheduled: null, actual: { id: "early", date: "2025-06-01", amount: 300_000 } }]);
  });

  test("a schedule with no rows has no range", () => {
    expect(mortgageScheduleYears([])).toBeNull();
  });

  test("a year outside the range goes to the nearest year of the range", () => {
    const years = { first: 2024, last: 2050 };
    expect(clampMortgageYear(2020, years)).toBe(2024);
    expect(clampMortgageYear(2030, years)).toBe(2030);
    expect(clampMortgageYear(2060, years)).toBe(2050);
  });
});
