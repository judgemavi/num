# 0043 — An amount outside all bands is not automatic, and automatic labels are scored again

Status: approved (owner, 2026-10-14)

## Context

All e-transfers of one direction have one normalized payee ("SEND E-TFR", "E-TRANSFER"), because normalization
removes the masked sender code. The owner confirmed Rent (2,550, 7 times) and Miscellaneous (40 and 80) for
"SEND E-TFR". The app labelled 15, 80, 1,500 and 2,000 as Rent, at level Sure. The reason was `learned_payee` with
confidence 864 for all of them: the payee signal does not look at the amount.

Two problems:

1. **An amount outside all bands is still automatic.** Decision 0036 gives the payee + amount signal only when a band
   contains the amount. When no band contains it, the payee signal alone can be automatic. But an amount far from all
   learned amounts is evidence against the learned labels.
2. **An automatic label is not scored again.** After a confirmation, the app scores only uncategorized rows (§7.3).
   A row that the app labelled before the user taught other labels keeps the old label.

## Decision

1. **Amount guard.** When the key (payee + direction, decision 0036) has learned labels and no band contains the
   amount, the result is not automatic. It can be a suggestion (Likely or Maybe). Recurring links and the mortgage
   rule do not change.
2. **Score again.** After each user confirmation, the app scores the rows of the same payees again. This includes
   the rows with an automatic label from the learned signals (`learned_amount`, `learned_payee`) that the user did
   not confirm. Other automatic reasons (recurring, refund, transfer pairs) do not change.
   - The new result is automatic with the same label: the label stays. `autoConfidence` and `autoReason` get the new
     values.
   - The new result is automatic with a different label: the app applies the new label.
   - The new result is not automatic: the app removes the category and the automatic fields. The row is
     uncategorized and shows the suggestion (if there is one). The merchant does not change, because the app cannot
     know if the user set it.
3. Each change writes the audit log in the same transaction as the confirmation.

Example: with the owner's data, a confirmation of a "SEND E-TFR" row scores the other rows again. 15, 1,500 and
2,000 are in no band: Likely Rent. 80 is in the Miscellaneous band: Miscellaneous and Rent have no clear lead, so
it is a suggestion.

## Consequences

- Spec §7.3 (decision with the setting, automatic labels) changes.
- Old automatic labels change only after a confirmation of the same payee. There is no migration and no script.
- Logic tests: no band contains the amount → not automatic; a key with no learned labels does not
  change; a recurring link is still automatic; after a confirmation, an automatic row with an amount outside all bands
  goes back to uncategorized with its merchant; an automatic row that still qualifies keeps its label with new values;
  an automatic row that now qualifies for another label gets that label; a confirmed row never changes; a recurring,
  refund or transfer automatic row never changes.
