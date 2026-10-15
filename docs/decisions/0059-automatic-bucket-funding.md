# 0059 — Buckets fill automatically from Unassigned each month

Status: approved (owner, 2026-10-14)

## Context

1. Spec §7.6 makes a funding proposal at each `fundsBuckets` paycheck. The user confirms it ("Fund this paycheck").
   The owner does not want to fund buckets by hand. Each bucket kind has a rule that gives its amount.
2. The owner: money is allocated from the accounts, not from a paycheck. A paycheck only adds money to the money that
   is available for allocation (Unassigned). Thus a funding record must not belong to a paycheck.
3. Spec §7.7 makes the user cover each overspent bucket. The owner wants the app to cover it from Unassigned automatically.
4. Unassigned is on-budget total − the sum of the positive bucket balances − bills reserved (§6). A negative bucket
   balance is not in that sum. Thus an overspend already decreases Unassigned.

## Decision

1. **Monthly amount (replaces §7.6 item 2).** For each calendar month, each active bucket has a monthly amount. The
   app calculates it from the balance at the start of the month. That balance does not include the funding of that
   month. It includes the covers of that month (item 8).
   - Spending: `refillTo − balance`, minimum 0.
   - Sinking: `(amount − balance) / the number of months from this month to the month of dueDate`, minimum 0.
     For a yearly sinking bucket, a `dueDate` before this month moves forward by whole years until it is not before this
     month. The calculation uses the moved date.
   - Goal: `(target − balance) / the number of months from this month to the month of targetDate`, minimum 0.
     If there is no date, the smaller of the fixed amount (`fixedAmount` is now monthly) and `target − balance`, minimum 0.
   - Emergency: decision 0060.
   - If the due date or target date is in this month or earlier, the whole shortfall.
   Round each amount up to a whole minor unit of the book currency.
2. **Owed.** Owed for a month = the monthly amount − the funding of that month that is not undone.
3. **Fill (replaces §5.9 and §7.6 items 1 and 3).** The app pays the owed amounts from Unassigned in priority order.
   It stops when Unassigned is used. A bucket with a lower priority waits for more money. Each payment is a `fund`
   event with its `month`. The user does not confirm or edit it.
4. **When.** The fill is one write with `asOf` from the request (`POST`). The browser sends it when the app opens and
   after each successful mutation. The fill is idempotent: when nothing is owed or Unassigned is 0, it writes nothing.
   The fill funds only the month of `asOf`. It never pays a past month. A month that the app did not fill is not paid
   later: the next month's amount corrects spending, sinking and dated goals. A goal with no date and a fixed amount
   skips that month. A bucket is owed nothing for a month before the month of its `startDate` (decision 0029).
   A read still never writes.
5. **Paychecks.** A paycheck makes no funding. Its link, unlink or delete does not change funding. `fundsBuckets` stays
   only for the window of bills reserved and safe to spend (§6).
6. **Undo.** The user can undo the funding of the month of `asOf` on Buckets (funding history). The money goes back to
   Unassigned. The month is then held: the fill does not pay it again. "Fund again" removes the hold. Audited.
   An older held month stays in the history as "Undone". It has no "Fund again". The covers (item 8) stay when a month
   is undone.
7. **Corrections.** To correct a bucket, the user moves, releases or funds money by hand (§5.8 events).
   A manual fund does not count as funding of a month.
8. **Overspending (amends §7.7).** The fill covers each negative bucket balance from Unassigned. The cover is written
   in the same write, before the owed amounts are paid.
   - Overspending already decreases Unassigned, because a negative balance is not in the sum of the positive balances.
     Let N = the sum of the negative balances (as positive numbers), and S = the part of N that cash did not cover =
     the smaller of N and the negative of Unassigned (0 when Unassigned is 0 or more).
   - The fill covers N − S in total, in bucket priority order (the highest priority first). Each covered bucket goes to
     0. The last one can be covered in part. The buckets with the lowest priority keep the uncovered part S.
     Thus when Unassigned is 0 or more, every negative bucket goes to 0.
   - A cover is a `cover` event (not a `fund` event). It has no `month`. It is not funding of a month, thus it does
     not reduce what a bucket is owed, and the undo of a month does not undo it. The user cannot undo a cover (the
     next fill would write it again). History shows it as "Covered from Unassigned".
   - A cover does not change Unassigned.
9. **Not enough money.** When a bucket stays negative after the fill:
   - The Overspent hygiene check fails (it passes when no bucket has a negative balance). Home and Buckets show the
     overspent buckets, with the answer: a move from a different bucket, or a release.
   - There is no review item for this.
   The app does not move money between buckets automatically.
10. **Still owed.** Home and Buckets show the amount that is still owed for the month of `asOf`, for each bucket.
    When the month is held, they say that the funding is undone and point to "Fund again".
11. **Feasibility (replaces the paycheck surplus of §7.8).** Monthly surplus = the monthly income − the monthly
    bills − the spending refills − the monthly amounts of the sinking, goal and emergency buckets. The monthly income
    is the yearly amount of the active income plans (safe amounts) divided by 12.
12. **Removed.** The funding run, the funding proposal of a paycheck, the "Fund this paycheck" review item and its
    `keep_unassigned` answer, the "Fund this paycheck" card on Home, the "Overspent bucket" review item.

## Consequences

- Spec §5.8, §5.9, §5.15, §6, §7.6, §7.7, §7.8, §10 (Overspent: fails when a bucket is negative) and §11 (undo of a
  month's funding replaces undo of a funding run) and §14 change.
- Slice 3.3 code is replaced: no funding record belongs to a paycheck.
- A bucket can stay negative when cash is short. The check and the panel then show it.
- A transaction with an earlier date can change the start balance of a month after the fill paid it.
  The fill then pays only the new owed amount. It does not take money back.
- A month that the app did not run in (the app was closed) is not paid later. The owner accepts this.
- Logic tests: each monthly amount (also the fixed goal cap and the yearly sinking date); owed after a partial fill;
  priority order with too little money; the fill of the month of `asOf` only, with no back-pay after a change of the
  start date or the settings; undo holds the month and the next month does not repay it; "Fund again"; a cover to 0
  when cash exists; a partial cover when cash is short; cover before the owed amounts; a cover is not funding of a
  month; the undo of a month leaves the covers; the check fails only when a bucket stays negative; idempotent fill;
  feasibility with the yearly income divided by 12.
