# 0054 — Recurring detection without a merchant, and old amounts outside the band

Status: approved (owner, 2026-10-14)

## Context

Spec §7.4 detects a new plan only for a merchant. The owner's real data shows two problems:

1. The import sets a merchant only from learning or from the person. About half of the transactions have no merchant.
   Rent (an e-transfer out) and rental income (an e-transfer in) have no merchant. The bank text of an e-transfer has
   a different reference each time (`SEND E-TFR ***ab1`). Thus learning cannot give them one merchant.
   These transactions have a category (Rent, Rental Income), but detection does not look at them.
2. A phone bill has one regular monthly run: a large first bill (a device and a fee), then five equal bills. The first
   bill is outside 10% of the median. Detection stops the full run. It does not propose the five regular bills.

## Decision

1. **Group.** Detection groups the transactions of one account:
   - A transaction with a merchant goes in the group of its merchant (as before).
   - A transaction with no merchant and one line that is not a transfer goes in the group of its category.
   - A transaction with no merchant, one line, no category and no transfer goes in the group of its exact amount.
   - A transaction with no merchant and a split or a transfer is not in a group.
2. **Old amounts outside the band.** When the amounts of the latest regular run are not within 10% of their median,
   detection removes the oldest transaction of the run and checks again. It stops when fewer than 3 transactions remain.
   A new amount outside the band is not removed. The run then gives no proposal.
3. **Proposal.** A proposal has `merchantId` and `categoryId`. Only one of the two has a value, or neither (a proposal
   for one amount). The key of a proposal uses its merchant, else `category-<id>`, else `amount-<amount>`. Thus the
   keys of merchant proposals do not change, and their "Not recurring" decisions stay.
4. **Covered.** An active plan of the same account covers a proposal:
   - a merchant proposal: the plan has the same merchant.
   - a category proposal: the plan has no merchant and has the same category.
   - an amount proposal: the plan has no merchant, no category, and the amount is in its tolerance.
5. **Detected list.**
   - A merchant proposal shows the merchant name. A category proposal shows the category name. "Add" creates the plan
     at once, as before. A plan from a category proposal has that category and no merchant.
   - An amount proposal shows the amount. It has no name. "Add" opens the Recurring editor with the proposal values.
     The person types the name and saves.

## Consequences

- Rent, rental income and the phone bill of the owner's data show in Detected.
- A plan with no merchant links by account, date and amount (§7.4 Link). This is not a change.
- A category with regular spending at no merchant (for example, interest) can give a proposal. The person can answer
  "Not recurring".
- A mortgage payment that is split into interest and a transfer is not detected. The mortgage item covers it (§5.2).
