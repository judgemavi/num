# 0048 — The Needs review page shows the confidence and the proposed label

Status: approved (owner, 2026-10-14)

Changes decision 0047, point 2, for the Needs review page.

## Context

On `/transactions/review`, each row needs review. Thus the "Needs review" badge in the Status column gives no
information. The Category column shows the stored label. A row with a suggestion has no stored label, so the column
shows "Uncategorized", and the user must open the row to see the proposal.

## Decision

1. On `/transactions/review`, the Status column is the **Confidence** column:
   - a row with a suggestion or an automatic label: its level (Sure, Likely, Maybe).
   - a question (transfer pair, refund of which purchase, which payment): "Question".
   - a row with no suggestion: nothing.
2. On `/transactions/review`, the **Category** column shows the proposed answer:
   - a suggestion: the proposed label ("No category" for a keep) and the proposed merchant.
   - a transfer pair: "Transfer to <the other account>".
   - other rows: the stored label and merchant, as on the All page.
   The proposed label uses the same text style as a stored label. The level in the Confidence column tells that it is
   a proposal.
3. `/transactions` and the account page do not change: the Status column and the stored label (decision 0047).

## Consequences

- Spec §7.3 and §14, and `docs/design.md` §6a change.
- The table reads the route to select the two cells and the column title. No new API field: the list item already
  has the review and the suggestion.
- No logic tests: the change is display only (decision 0004).
