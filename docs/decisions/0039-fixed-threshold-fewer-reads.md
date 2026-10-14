# 0039 — Fixed matching threshold and fewer read routes

Status: accepted (owner, 2026-10-14)

## Context

1. The setting `autoConfidence` (Careful 0.95, Balanced 0.85, Eager 0.75) sets when a label becomes automatic
   (decision 0017). The owner uses only Balanced. The setting adds a Settings page, two routes and two MCP tools.
2. `GET /api/accounts/{id}/closing` gives the closing date and the closing balance of the last imported statement.
   Only the Reconcile dialog reads it, and the dialog also reads the checkpoints of the account.
3. `GET /api/accounts/{id}/statements` gives the card statements and the estimated next statement (§5.13). No screen
   reads it. The forecast and the hygiene checks calculate the statements themselves.
4. `GET /api/transfer-pairs` gives the possible transfer pairs. Needs review already shows these pairs, with the other
   open questions. Two lists of the same questions can disagree.
5. The Card statements panel on Accounts says "Add a credit card to see what you owe and the due day". The panel shows
   only the balance.

## Decision

1. The threshold for an automatic label is fixed at 0.85 (the old Balanced; 850 in thousandths, decision 0036). Remove the setting `autoConfidence`,
   `GET /api/settings/matching`, `PATCH /api/settings/matching`, their MCP tools and the Settings → Matching page.
   A migration removes the stored setting. The column `transactions.autoConfidence` (the score 0–1000 of one automatic
   label) stays. It is a different value.
2. `GET /api/accounts/{id}/checkpoints` returns `{ items, closing }`. `closing` has `closingDate` and `closingBalance`
   (null when no active import has them). Remove `GET /api/accounts/{id}/closing`.
3. Remove `GET /api/accounts/{id}/statements`. The card statement calculation stays for the forecast and the hygiene
   checks. The Card statements panel shows only the balance. Its empty text is "Add a credit card to see what you owe."
4. Remove `GET /api/transfer-pairs`. Needs review is the one list of open questions. `POST /api/transfer-pairs`
   (link a pair) stays.

## Consequences

- Spec changes: §5.13 (the UI does not show estimated statements), §5.18 (no `autoConfidence` row), §7.3 (fixed
  threshold, no Matching page), §14 (Settings subpages).
- Supersedes the `autoConfidence` setting of decision 0017 and the Careful and Eager thresholds of decision 0036.
- The MCP tool list loses `get_settings_matching`, `patch_settings_matching`, `get_accounts_id_closing`,
  `get_accounts_id_statements` and `get_transfer_pairs`. The other tools do not change.
- Logic tests: the level rule uses the fixed threshold (850 is automatic, 849 is a suggestion). One answer at the same
  amount (850) is automatic.
