# 0030 — Insights: one timeline and a group donut

Writing standard: ASD-STE100.

Status: approved (owner, 2026-10-13)
Date: 2026-10-13

## Context

1. The owner compared v1 and v2 Insights. v1 gave more value in two areas:
   - One chart showed income, spending and the forecast on one timeline. The user saw the past and the future together.
   - A donut showed spending by group. The user clicked a slice to see the categories in it.
2. v2 Insights (spec §9, decision 0021) has three separate charts: the forecast chart, the 12-month trend of one
   category and net worth. The spending breakdown is a list only. The user cannot compare actual and forecast
   values in one view.
3. A donut with all categories is not easy to read when it has more than approximately 7 slices.
   Groups (§5.3) are few. Thus, a donut by group, with categories as the second level, is easy to read.

## Decision

### Timeline

1. Insights shows one timeline chart. It replaces the forecast chart and the 12-month trend chart.
2. The timeline has:
   - Monthly bars: income and spending (§5.3 definitions). Transfers are not income or spending.
   - A line: the total balance of the on-budget accounts at the end of each day.
3. Months before `asOf` show actual values. Days after `asOf` show the forecast (§8) in a lighter tone.
   A marker shows `asOf`.
4. The month of `asOf` has two parts in each bar: the actual value to `asOf` and the forecast value after `asOf`.
5. Forecast income = unlinked recurring income occurrences (§8 known series).
   Forecast spending = unlinked recurring bills + the variable spending of the estimated series (§8).
   Card payments are transfers. They are not spending.
6. The balance line after `asOf` shows the estimated series. The known series is a second line.
   The lowest point of the estimated series has a marker with its date.
7. The forecast part is always the 90 days of §8. The period (items 12–15) sets the actual part.

### Donut

8. Insights shows a spending donut with two levels:
   - Level 1: spending by group. Categories with no group are one slice, "No group".
     Uncategorized lines (decision 0024) are one slice, "Uncategorized".
   - Level 2: the user clicks a group slice. The donut shows the categories in that group.
     A "Back" control goes to level 1.
9. The user clicks a category slice. Insights does two things:
   - The timeline shows the spending of that category only (this replaces the 12-month trend of §9).
   - The list below the donut shows that category. A row opens Transactions with the filter.
10. Refunds decrease spending (§5.3). A group or category with spending of zero or less is not a slice.
    It stays in the list with its value.
11. The list under the donut stays. It shows the exact values of the slices.
    Merchant and tag breakdowns stay as lists only (item 18).

### Period

12. Insights has one period selector, as in v1: 1, 3, 6 or 12 months, or All. The default is 6.
    "1" is the month of `asOf`. "All" starts at the first transaction.
13. The selector has one more option, "Custom". It shows From and To date fields. The user can type any period.
14. The timeline, the donut and the list use the selected period, up to `asOf`.
15. The user clicks a month bar on the timeline. Then the donut and the list use that month only.
    A control clears the month and goes back to the selected period.

### Controls that are removed

16. The "Show" selector (category, group, merchant, tag) is removed. The donut levels replace group and category.
17. The 12-month trend category selector is removed. A click on a category slice replaces it (item 9).

### Merchant and tag lists

18. Under the donut, Insights shows two more lists for the selected period: spending by merchant and spending by tag.
    Each list sorts by spending, largest first. A row opens Transactions with that merchant or tag as the filter.

## Consequences

- Spec §9 changes: the timeline and the donut replace the 12-month trend and the breakdown selector.
  The period is the selector of items 12–13.
- Spec §14 changes: the Insights row lists the timeline and the donut instead of "trends" and "forecast chart".
- Decision 0021: the forecast chart on Insights becomes part of the timeline.
- The forecast service (§8) returns monthly forecast income and spending, in addition to the daily balances.
- The insights query schema (decision 0004) changes: `window` (`1 | 3 | 6 | 12 | all | custom`), `from?` and `to?`
  (only with `custom`), `month?`, `group?`, `category?`. The `by` field and the trend category are removed.
- Net worth, mortgage and the month story do not change.
- MCP tools follow the routes (decision 0019). No separate MCP work.
- There is no income donut (owner, 2026-10-13).
- Merchant and tag lists stay (owner, 2026-10-13).
- Logic tests: forecast monthly income and spending (recurring income, bills, variable spending; card payments
  excluded); the split of the `asOf` month into actual and forecast parts; group totals with "No group",
  "Uncategorized" and refunds.
- `docs/design.md` gets the timeline and donut colours from the existing chart tokens. No new colours.
