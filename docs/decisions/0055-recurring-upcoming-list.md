# 0055 — Recurring: one Upcoming list for all plans, no plan side panel

Status: approved (owner, 2026-10-14)

## Context

1. The Recurring screen has a side panel for the selected plan. It shows the name, the amount mode, the forecast and
   "Edit recurring". A click on a plan row opens the plan editor. Thus the panel shows again what the editor shows.
2. Below the panel, the occurrences of the selected plan show in "Upcoming" and "Past". For a fixed plan, Upcoming
   shows the same amount 8 times. The owner wants to see what is due next across all plans.
3. The Past list is the only place that shows "Amount changed" (decision 0047), the link of a past occurrence, and
   "Undo" for "Keep the plan amount".

## Decision

1. The Recurring screen has no plan side panel and no selected plan.
2. The side column shows "Upcoming": the occurrences of all active plans from today to 30 days later, by date.
   - Each row shows the plan name, the date, the status (Linked, Skipped, Amount changed) and the amount: the actual
     amount when linked, else the forecast amount of the plan.
   - A click on a row opens the plan editor.
   - The row menu has "Link a transaction" and "Skip" for an open occurrence, "Remove link" for a linked occurrence
     and "Restore this occurrence" for a skipped occurrence.
3. The app has no list of past occurrences. Past occurrences stay in the data and in the API (`list_occurrences`).
   - Home shows the missed occurrences of the last 35 days (§7.4), as before.
   - The web app has no "Undo" for "Keep the plan amount".
4. A plan row in the Recurring list shows the badge "Amount changed" when its latest linked amount is outside the
   tolerance (`changed` in the recurring signals).
5. **API.** `GET /api/recurring/upcoming?asOf=` (MCP tool `list_upcoming_occurrences`) returns the upcoming
   occurrences. Each item has the occurrence fields, `planId`, `accountId` and `forecastAmount`.

## Consequences

- A person cannot see or change the link of a past occurrence in the web app.
- The Detected list shows the amount of each proposal.
