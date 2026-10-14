# 0046 — A kept "no category" teaches like a category

Status: approved (owner, 2026-10-14)

## Context

The user can keep a transaction without a category (decisions 0024, 0045). This is an answer: the app records the
decision `keep_uncategorized`. But learning reads only confirmed rows with a category, so the answer teaches nothing.
The owner kept an "E-TRANSFER" of 40 uncategorized. The next 40 still gets "Likely Rental Income?".

## Decision

1. **No category is a learned label.** A row teaches "no category" when it has one line with no category and no
   transfer, it is not a mirror, and it has the decision `keep_uncategorized`. The label is "no category" + the merchant
   of the row. Rows without the decision teach nothing, as before.
2. "No category" is a label as in decisions 0036, 0043, 0044 and 0045: it has a band, it gets the payee signal, and it
   counts as a category for the guard (Rental Income and "no category" are two categories).
3. **Automatic "no category".** When "no category" is the automatic result, the row stays uncategorized and gets the
   automatic fields (`autoReason`, `autoConfidence`, `autoSourceId`). It needs review at level Sure, with the answer
   "No category". "Looks right" and "Approve all" record `keep_uncategorized` for the row and clear the automatic
   fields. A suggestion of "no category" shows "No category?" with "Yes", which records the same decision.
4. The re-score of decision 0043 also applies to rows with an automatic "no category".
5. The similar payee and brand family signals (decision 0026) do not use "no category" labels.

## Consequences

- Spec §7.3 (confirmations) changes.
- No schema change and no migration. The keep decision is the flag that tells an intentional "no category" from a row
  that nobody reviewed.
- Logic tests: a kept row teaches "no category" and a row without the decision does not; a new 40 that fits only the
  "no category" band is automatic "no category" and stays uncategorized with the automatic fields; "Looks right" and
  "Approve all" record the keep and clear the automatic fields; Rental Income + "no category" turns on the guard for
  a far amount; a later confirmation re-scores an automatic "no category"; similar and family ignore "no category".
