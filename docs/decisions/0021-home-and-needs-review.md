# 0021 — Home dashboard, Needs review, confidence levels

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-09

## Context

The owner wants to land on a view of financial health. Inbox and Transactions show the same transactions. Plan,
Insights and the Inbox split the health picture over three screens. Confidence percentages are not clear to a person
who is not technical. The owner does not want to give attention to each sure label, but wants to approve them easily.

## Decision

- **Home** is the first screen: safe to spend, the needs-review count, hygiene checks, this month (the Plan content,
  "Fund this paycheck", missed payments, overspent buckets, goals), spending changes, net worth.
- **The Inbox is removed.** Transaction questions move to Transactions → "Needs review" (a server filter).
  Other items move to Home (funding, missed, overspent), Recurring → Detected (new plans) and Imports (import problems).
  Recorded "no" decisions (decision 0016) stay. No payee groups (decision 0015).
- **The Plan screen is removed.** Its content goes to Home; goal feasibility goes to Buckets; the forecast chart goes to
  Insights. The hygiene panel moves from Insights to Home.
- **Levels, not percentages:** Sure (automatic), Likely (≥ 0.75), Maybe (< 0.75). Plain reasons. The engine does not
  change.
- **Automatic labels need review.** They stay applied. "Approve all Sure" and "Approve all Likely" confirm in bulk;
  an approval counts as a confirmation.

## Consequences

- 7 screens: Home, Transactions, Buckets, Insights, Accounts, Recurring, Settings.
- Inbox routes and screens are removed or moved. `inbox_decisions` becomes the review decision store (same data).
