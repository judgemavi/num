# 0037 — Show the level of a label, not its reason

Status: approved (owner, 2026-10-14)

## Context

Decision 0021 shows a level (Sure, Likely, Maybe) and a plain reason for each automatic label and each suggestion.
Examples: "You chose this 4 times for this payee", "Same as COSTCO WHOLESALE". The reason text adds a second line to
each row. The count in it can be wrong: after decision 0036, the count of an applied payee + amount label counts all
answers of the payee, not only the answers in the band. The owner decided that the level is sufficient.

## Decision

1. The UI shows the level of an automatic label or a suggestion. It does not show the reason text.
   This applies to the Review column, the Home cards, the transaction editor header and the suggestion line in the
   editor.
2. The API keeps the reason codes (`autoReason`, `autoSourceId`, the signal reasons). The logic uses them: a
   confirmation clears `autoReason`, import undo, transfer pairs and refund links.
3. Values that the API calculates only for the reason text are removed (the learned count of a row, and other
   parameters that only the text uses).
4. The "Refund of <date>" text of a linked refund stays. It shows a link, not a reason.

## Consequences

- Spec §2 rule 3 and §7.3 (Levels, Automatic labels) change. `docs/design.md` §6 changes.
- Decision 0021 is changed for the reason text only. The levels do not change.
- No schema change.
- No new logic tests. Tests for removed values are removed.
