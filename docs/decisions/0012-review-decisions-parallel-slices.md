# 0012 — Review decisions for slices 2.2, 2.3, 2.5 and 3.2

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

Parallel reviews of four slices found risks that need a rule in the spec.

## Decision

- **No regex rules.** A user regex can block the server (catastrophic backtracking). Rules use exact, prefix or contains.
- **Reconciled locks money only.** Date, account, amounts, transfer targets and delete need an unlock.
  Merchant, notes, categories, memos and tags stay editable and audited.
- **Apply to existing** changes only single-line transactions. Splits are never changed.
- **Stored normalized payee** (`payeeNormalized`, indexed) so suggestions do not scan the book.
  When `normalizePayee` changes, run the backfill script again (pre-release only).
- **Transfer detection** uses the last 90 days of unlinked transactions.
- **Bucket undo** applies only to events without a funding run. **Archive** needs a zero balance and removes category mappings.
- **Migrations** run with foreign keys off and finish with `PRAGMA foreign_key_check`. Any violation stops startup.

## Consequences

- Merge order: 2.5 (no migration), 3.2 (migration 0004), 2.3 (migration 0005), 2.2 (renumber to 0006).
