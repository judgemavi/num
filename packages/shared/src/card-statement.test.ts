import { expect, test } from "bun:test";
import { cardStatements } from "./card-statement";

test("the due date uses the median gap and otherwise 21 days", () => {
  const dated = cardStatements({
    statements: [{ date: "2026-01-15" }, { date: "2026-02-14" }, { date: "2026-03-16" }],
    paymentDates: ["2026-02-04", "2026-03-12"],
  });
  expect(dated.map((row) => row.dueDate)).toEqual(["2026-02-07", "2026-03-09", "2026-04-08", "2026-05-09"]);
  expect(dated.map((row) => row.code)).toEqual(["statement", "statement", "statement", "estimated"]);

  const fallback = cardStatements({
    statements: [{ date: "2026-01-15" }],
    paymentDates: ["2026-02-01"],
  });
  expect(fallback[0]).toEqual({ code: "statement", date: "2026-01-15", dueDate: "2026-02-05" });
});

test("the next statement is one month after the last statement and is estimated", () => {
  const rows = cardStatements({
    statements: [{ date: "2026-01-31" }],
    paymentDates: [],
  });
  expect(rows[1]).toEqual({ code: "estimated", date: "2026-02-28", dueDate: "2026-03-21" });
});
