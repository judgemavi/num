# 0031 — Remove the month close

Status: approved (owner, 2026-10-13)

## Context

1. A month close is a stored "reviewed" mark (`month_closes`). It does not lock the month and it stores no summary
   (spec §5.13, §7.5).
2. The mark is a manual step, but calculated values depend on it: the forecast uses the last 3 closed months (§8) and
   the savings-rate check uses the last 3 closed months (§10). If the user does not close months, these values have no
   data. The savings-rate check then passes with no data.
3. The app already calculates the conditions for a close (checkpoints, Needs review). The mark adds no information.
4. Most of the month story is on other screens: income, spending and savings (Insights), uncategorized (Needs review),
   recurring changes (Home, Recurring), bucket results (Buckets), plan compared with actual (Home). Only the category
   changes and the new merchants are not on another screen.
5. The month API has 4 routes and one screen for this mark.

## Decision

A month is not a managed entity. A month is only a calendar unit that the app derives from dates.

1. Remove the month close: the `month_closes` table, the close and open-again actions, the close rules, and the
   hygiene check "Months are closed".
2. Remove the month API (`GET /api/months`, `GET /api/months/{month}`, `POST /api/months/{month}/close`,
   `POST /api/months/{month}/reopen`) and the Months screen (`/insights/months`). The MCP tools for these routes go
   away with the routes.
3. Remove the month story as a separate report. Insights gets a "Changes" part for one month, the change month:
   - The change month is the selected month (`month` in the query). If no month is selected, it is the month of the
     last day of the period.
   - The 3 largest increases and the 3 largest decreases by category, compared with the median of the 3 months before
     the change month (same calculation as the month story had).
   - New merchants: merchants whose first transaction is in the change month (same calculation as the month story
     had).
4. Insights also returns the savings rate of the breakdown range as `savingsRateMilliPct` (null when income is 0).
   The Insights summary shows it.
5. Home "spending changes this month" reads the Changes part from `GET /api/insights` (period of 1 month, thus the
   change month is the month of `asOf`).
6. A complete month is a calendar month whose last day is before `asOf` and that is not before the month of the first
   transaction in the book. The forecast (§8) and the savings-rate check (§10) use the last 3 complete months, not the
   last 3 closed months.
7. The monthly loop (§1) stays, without the mark: balances agree with statements (checkpoints) and Insights shows the
   changes of the month.

## Consequences

- Spec changes: §1 loop table, §2 principle 4, §5.13, §7.5, §8, §9, §10, §11, §14 (Insights row).
- A migration drops `month_closes`. Audit log rows with the entity `month_close` stay as history.
- Shared schemas, error codes and UI text for the month close and the month story are removed.
- Logic tests: the forecast and the savings rate use complete months; the change month rule; the category changes and
  new merchants calculations keep their tests.
