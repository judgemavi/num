# 0052 — Pending only in accounts that get imports

Status: approved (owner, 2026-10-14)
Changed by decision 0057 (2026-10-14): the reconcile help (`uncleared`) is removed. The rule for "Pending" stays.

## Context

1. Decision 0050 says: a new manual or MCP transaction is `open`, and a new mirror is `open`. Only an import row that
   matches the transaction makes it `cleared`. The UI shows an `open` row as "Pending". The reconcile help shows it
   with the code `uncleared`.
2. Some accounts never get a statement import. Examples: a mortgage, a loan, an investment account. A mirror of a
   mortgage payment or of a transfer to an investment account stays "Pending" for all time. The reconcile help of
   such an account always shows these rows as a cause.
3. An account has the import fields `importPreset` and `columnMap` (§5.1). The app saves them after the first
   import of the account. Thus they tell if the account gets imports.

## Decision

1. An account **gets imports** when it has `importPreset` or `columnMap`.
2. A new manual, MCP or mirror transaction is:
   - `open` when its account gets imports.
   - `cleared` when its account does not get imports.
3. The other rules of decision 0050 §4 do not change: an imported transaction is `cleared`, a matched transaction
   becomes `cleared`, and import undo puts back the status from before the import.
4. When an account gets its first import, the status of its existing transactions does not change.
5. A migration sets `status = 'cleared'` on each `open` transaction whose account does not get imports.

## Consequences

- Decision 0050 §4 changes. Spec §5.4 and the status rules in §7 change.
- The UI does not change: "Pending" shows only for `open` rows.
- The reconcile help of an account that does not get imports has no `uncleared` cause.
- Logic tests: a manual transaction and a mirror in an account with and without import fields; the migration
  clears only `open` rows in accounts without import fields.
