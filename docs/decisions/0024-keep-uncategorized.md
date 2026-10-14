# 0024 — Keep a transaction uncategorized

Status: approved (owner, 2026-10-12)
Changed by decision 0045 (2026-10-14): a save with no category after an automatic label also records the decision.

## Context

The decision table in spec §7.3 says an uncategorized transaction must be answered with a category, a transfer or
a split. The owner reviews some transactions and wants to keep them without a category.

## Decision

- In the transaction editor, Save on an uncategorized transaction that needs review, with no change, records the
  "no" decision `keep_uncategorized` (decision 0016, key `uncategorized:<transaction id>`). The row leaves Needs review
  and stays uncategorized. Save with other changes also records it when the row stays uncategorized.
- The editor shows the note "Kept without a category" and an undo link, as for other recorded decisions.
- The decision ends when the transaction gets a category, a transfer or a split (the key is removed in the same write).
- Uncategorized amounts still show as "Uncategorized" in spending and Insights. Hygiene does not count kept rows.
- The table and the bulk actions do not change. There is no dismiss button in the table.

## Consequences

- Spec §5 (uncategorized needs review) and §7.3 (decision table) change.
- Logic tests: Save with no change records the decision and the row leaves Needs review; a later category removes
  the decision; undo brings the row back to Needs review.
