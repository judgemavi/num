# 0057 — Bank balance instead of checkpoint and reconcile

Status: approved (owner, 2026-10-14)

## Context

1. Spec §5.13 and §7.5 make the user create a checkpoint. The app saves it only when its balance on that date is equal
   to the statement balance. After that, the transactions on or before the date are "reconciled", and their money
   fields are locked until the user unlocks the checkpoint.
2. A person who is not technical does not know the words "reconcile", "checkpoint" or "unlock". The question of that
   person is: "Does Num agree with my bank?"
3. The reconcile help (§7.5 step 2) shows possible causes. These causes are guesses that are frequently wrong:
   - "Possible duplicates" pairs all transactions with the same amount within 3 days, and it ignores the payee and the
     source. Two tickets on one flight and lift passes at two resorts show as duplicates. The import already removes
     rows with the same identity (§7.2), and two rows from one statement are both real.
     A person can delete a real transaction because the app calls it a duplicate.
   - "Pending" repeats the status that the transaction list already shows.
   - "No transactions" ranges also show as a large difference.
4. The lock adds a state that the person must learn, blocked actions, and special cases in other features: import undo
   (§7.2 step 8), bulk edit ("reconciled for a transfer", §7.3) and undo of a checkpoint (§11).
5. A calculated balance cannot find a missing import, a row that the app has two times, or a wrong opening balance.
   Only a number from the bank can find them. Thus the app must keep the bank's number. But an import with a running
   balance already supplies it (`closingBalance`, `closingDate`, §7.2 step 6).

## Decision

1. **Bank balance.** The checkpoint becomes a bank balance: `accountId`, `date`, `balance`, `importBatchId?`,
   `createdAt`. It has no `unlockedAt`. An account has a maximum of one bank balance on each date. The UI calls it
   "Bank balance". The words "reconcile", "checkpoint", "reconciled" and "unlock" are not in the UI.
2. **The app saves it when it is different.** A bank balance is a fact from the bank. The app saves it also when the
   calculated balance is not equal.
3. **From an import.** An import with a closing balance saves a bank balance for its closing date with its
   `importBatchId`. The person does nothing. Undo of the batch removes it.
4. **Typed.** For an account whose files have no balance, the account page has "Add bank balance": the date and the
   balance. The person can edit and delete a bank balance. The audit log records each change.
5. **Status.** The app compares the calculated balance on the date of the latest bank balance with that balance.
   The Accounts list and the account page show the result:
   - Equal: "Matches your bank on Apr 30".
   - Not equal: "Your bank says $1,240.00. Num says $1,202.88. $37.12 different."
   The app calculates the status each time. An edit of an earlier transaction changes the status at once.
   Home also shows each account that is not equal. Home is "all clear" only when each account matches its bank.
6. **Actions when not equal.** Only two:
   - "Compare transactions" opens the Transactions list for that account up to the date of the bank balance.
   - "Start this account from the bank's balance" sets the opening balance so that the balances are equal
     (§5.1, opening balance + the difference). The app shows it only when the account has no earlier bank balance that
     is equal. It does not show it for a mortgage with terms (decision 0040).
7. **No causes.** The app does not show possible causes. Remove the reconcile help (`uncleared`, `duplicate`, `gap`).
8. **No lock.** Remove the calculated `reconciled` state (§5.4), the locked money fields, unlock (§7.5), the
   "Checkpoint (unlock)" undo (§11), the "not reconciled" condition of import undo (§7.2 step 8) and the "reconciled"
   skip reason of bulk edit (§7.3). Each change of a transaction stays in the audit log. The status (item 5) shows
   when a change breaks an earlier match.
9. **Cards have no statements.** A bank balance of a `credit_card` account is the same as on other accounts. Remove the
   derived statements and due dates (§5.13). A card export that ends in the middle of a cycle is then not a problem.
   - **Payment day.** The app learns it from the transfers into the card: the median day of the month of the payments
     in the last 12 months. With one payment, it uses the day of that payment. With no payment, the forecast has no
     card payment and shows the same warning as `manual`.
   - **Forecast (§8).** `full`: the card's balance on `asOf`, on the next payment day, from the usual payment account.
     This amount can be larger than the real payment, because it includes spending after the cut-off. For a safety
     forecast, a larger outflow is the safer error. `fixed`: `fixedPayment` on the next payment day. `manual`: no change.
   - **Hygiene (§10).** Remove "Cards paid in full". Without a statement balance the app cannot do this check
     correctly, and a substitute needs a fixed threshold.
10. **Monthly loop.** §1 "Monthly reconcile" becomes "Monthly check": each account matches its bank. Usually the
    imports do this, and the person only looks at the status.

## Consequences

- The person learns one idea: the bank's balance on a date, and whether Num agrees.
- Most accounts get a status with no work from the person.
- A transaction is never blocked. A wrong change shows at once as a difference on the account.
- Less code: no reconcile help service, no unlock, no lock checks in transaction writes, bulk edit and import undo.
- Card statements, due dates and the 21-day default are removed. The forecast of a `full` card can show a payment
  that is larger than the real payment.
- The spec changes in §1, §2.1 (wording only), §5.1 (opening balance and card fields), §5.4, §5.13, §7.2, §7.3, §7.5, §8, §10,
  §11, §12 (annotations) and §14 (Home, Accounts). Decisions 0012 (reconciled locks money), 0014 (statements are card
  checkpoints), 0039 (checkpoints read) and 0052 (uncleared help) change in the same parts.
- The `checkpoints` table changes: rename, remove `unlockedAt`, add `importBatchId`. This is a migration.
- Tests of the reconcile help and of the lock are removed. New logic tests: the status, and the save and undo of a bank
  balance from an import.
