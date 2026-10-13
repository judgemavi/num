# 0025 — Learn a mortgage payment, and a simpler split editor

Status: approved (owner, 2026-10-12)

## Context

1. The owner saved several "STRIVE MTG" payments as a mortgage split. The other payments of that payee get no
   suggestion, because a split never teaches the matching engine. Only a recurring mortgage item splits automatically.
2. The split editor is hard to use: a direction toggle on each line, the amount before the category, and the user
   must calculate the last amount.

## Decision

1. **Learned mortgage payment.** A mortgage payment is a transaction from the terms' payment account with exactly two
   lines: a transfer to a mortgage account that has terms, and the terms' interest category. When the user confirms
   a mortgage payment (save, Yes or approve), it teaches the payee: "mortgage payment to <mortgage account>".
   - The other transactions of that payee (same payee key, same account, money out, uncategorized, not reconciled)
     get the suggestion "Mortgage payment" at level Likely, with the reason "You chose this N times for this payee".
   - "Yes" and "Approve all Likely" apply the split for each transaction's date and amount from the terms (§5.2):
     the interest from the schedule, the principal is the amount minus the interest.
   - If the terms give no split for a date (no schedule row), there is no suggestion for that transaction.
   - It is never automatic (Sure). The recurring mortgage item rule (§7.3) does not change.
2. **Split editor.**
   - Each line: "Category or account" picker first, then the amount, then a remove button. One line per row.
   - Lines take the transaction's direction. A line menu has "Money in on this line" for a mixed split; such a line
     shows "+" before its amount.
   - A new line starts with the amount that is left. With two lines, a change to one amount sets the other.
   - Under the lines: "+ Add a line", then "All assigned" or "$X left" with "Put it on the last line".
   - No SplitBar in the editor.

## Consequences

- Spec §7.3 (split automation, learning) and design.md §6b (split) change.
- Logic tests: a confirmed mortgage payment makes the other payee rows Likely; Yes and Approve all Likely write the
  correct split for each date; a date with no schedule row has no suggestion; a split that is not a mortgage payment
  teaches nothing.
