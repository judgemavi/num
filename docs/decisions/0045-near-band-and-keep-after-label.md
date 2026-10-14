# 0045 — A far amount of a one-category payee is not automatic, and removing an automatic label keeps the row

Status: approved (owner, 2026-10-14)

## Context

1. Decision 0044 removed the amount guard for a payee with one category. The owner confirmed only Rental Income
   (2,000) for "E-TRANSFER". Then 40, 18.72 and 500 became Sure Rental Income from the payee signal (about 0.95).
   For KYNDRYL CANADA PAY (Pay only), an older pay of 4,750.91 is about 7% below the band and is correctly Pay.
   The difference is the distance from the band: 40 is 98% below 2,000.
2. The owner removed the automatic label of three rows and saved them with no category. Decision 0024 records
   "keep uncategorized" only when the row was uncategorized before the save. These rows had an automatic label, so
   the app did not record the decision. The rows came back to Needs review with the same suggestion, and
   "Approve all" can apply the removed label again.

## Decision

1. **Near band.** For a key with one category (decision 0044), an amount outside all bands is automatic only when it
   is near a band: from 75% of the lowest amount of the band to 125% of the highest amount (absolute values, integer
   arithmetic). An amount that is not near a band gives at most a suggestion. Keys with two or more categories keep
   the guard of decision 0043.
2. **Keep after an automatic label.** When the user saves a transaction that had an automatic label, and the saved
   transaction has a line with no category and no transfer, the app records `keep_uncategorized` (decision 0024).
   The row leaves Needs review. The decision ends when the row gets a category, a transfer or a split.
   The app does not label a kept row automatically (the spread after a confirmation and the re-score of decision
   0043 skip it). Only the user ends the decision.
3. The re-score of decision 0043 applies rule 1 after the next confirmation of the same payee.

Examples with the owner's data:
- KYNDRYL CANADA PAY 4,750.91 (band from 5,173.24): near (75% is 3,879.93). Automatic Pay.
- E-TRANSFER 40, 18.72 and 500 (band 2,000): not near (75% is 1,500). Likely Rental Income.
- Remove the automatic Rental Income of a 40 row and save with no category: the row is kept uncategorized and leaves
  Needs review.

## Consequences

- Spec §5 (uncategorized) and §7.3 (the guard exception) change. Decision 0024 is changed for automatic labels.
- No schema change and no migration.
- Logic tests: one category and an amount near the band (below and above) is automatic; one category and an amount
  not near the band is a suggestion; the edges at exactly 75% and 125%; two categories keep the 0043 guard; save of an
  automatically labelled row with no category records the keep decision and the row leaves Needs review; a later
  category ends it; a confirmation of the same payee does not label a kept row; the re-score applies rule 1.
