# 0044 — The amount band selects the labels, and the guard needs two categories

Status: approved (owner, 2026-10-14)

## Context

Decision 0043 added the amount guard: when no band of the key contains the amount, the result is not automatic.
The owner's data shows two problems:

1. **The guard is too strict for a payee with one category.** KYNDRYL CANADA PAY has only Pay. The band is
   5,121.51–6,510.17. Older pay (4,750.91–5,069.08, before a raise) is outside the band, so it is only Likely. An amount
   outside the band cannot point to a different label when the payee has no other label.
2. **The payee signal competes with a band that does not contain the amount.** "E-TRANSFER" (money in) has Rental
   Income (2,000, 8 answers, the newest 6) and Other income (18.72–500, 3 answers). A new 40 is in the Other income
   band (about 0.90). The payee signal gives Rental Income about 0.93, so Rental Income wins with no clear lead, and
   the row is only a Likely Rental Income suggestion.

## Decision

1. **Band selects the labels.** When one or more bands of the key contain the amount, the payee signal gives
   confidence only to the labels whose band contains the amount. Other labels get no payee signal. The similar,
   family, recurring and transfer signals do not change.
2. **Guard needs two categories.** The guard of decision 0043 applies only when the learned labels of the key have
   two or more different categories. With one category, an amount outside the band uses the payee signal, as before
   decision 0043.
3. The re-score of decision 0043 applies these rules after the next confirmation of the same payee.

Examples with the owner's data:
- KYNDRYL CANADA PAY 5,069.08: one category (Pay), so no guard. Payee signal about 0.95: automatic.
- E-TRANSFER 40: only the Other income band contains it. Other income about 0.90, no other candidate: automatic.
- SEND E-TFR 80: only the Miscellaneous band (40–80) contains it. Miscellaneous about 0.86: automatic.
- SEND E-TFR 1,500: two categories (Rent, Miscellaneous) and no band contains it: guard, Likely Rent.

## Consequences

- Spec §7.3 (signals table and the guard exception) changes.
- No schema change and no migration.
- Logic tests: a band that contains the amount removes the payee signal of the other labels; two labels with the same
  category and different merchants count as one category for the guard; one category and an amount outside the band
  is automatic with enough answers; two categories and an amount outside all bands is not automatic; the owner
  examples above with synthetic payees; the re-score uses the new rules.
