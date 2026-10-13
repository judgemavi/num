# 0027 — Mortgage terms in the account dialog

Status: approved (owner, 2026-10-13)

## Context

1. The mortgage terms have a `principal` and a `principalAsOf`. The account has an opening balance and an opening date.
   Both pairs give the amount owed on a date. The user must enter the same values two times, in two dialogs.
   When the user changes one pair, the other pair does not change. Then the schedule and the account balance do not agree.
2. The terms are in a separate dialog. The user does not find them from the account dialog.
3. The payment schedule shows only the date and the payment. It does not show interest, principal or the balance.
   The API calculates these values but the UI does not show them.
4. The start date has a special meaning that the form does not tell the user. Interest starts on the start date.
   When the start date is not a payment date, the first payment gets a short or long period of interest.

## Decision

1. **One place.** The mortgage terms are a section of the account dialog. The section shows when the kind is `mortgage`.
   The separate mortgage terms dialog is removed. "Mortgage terms" on the mortgage panel opens the account dialog.
2. **No principal fields.** `principal` and `principalAsOf` are removed from the terms.
   The schedule starts from the account's opening balance (the amount owed) on the account's opening date.
3. **Fixed opening date.** A mortgage with terms has a fixed opening date and opening balance.
   The opening date does not follow the transactions (no automatic opening date).
4. **Optional terms.** The terms are optional. Without terms, the account shows its balance and has no schedule
   and no mortgage split. The section is open by default and has this help text:
   "Add the terms to see the payment schedule and to split each payment into interest and principal."
5. **Help for the opening date.** When the terms are on, the opening date field has this help text:
   "Use the date of the last payment before the first payment in Num. Use the amount owed after that payment."
   When the first payment date is not one payment period after the opening date, the form shows this warning:
   "The first payment is not one payment period after the opening date. The first payment gets more or less interest
   than a regular payment." The user can save.
6. **Schedule rows.** Each schedule row shows the date, the payment, the interest, the principal and the balance
   after the payment. A past row also shows the actual payment, or "No payment". The rows of past years are collapsed.
7. The API and MCP: one write for the account and its terms. The terms fields are part of the account write
   for a mortgage. The separate terms write is removed.

## Consequences

- Spec §5.1 (opening date for a mortgage with terms) and §5.2 (terms fields) change.
- design.md: the account dialog has the mortgage terms section. The schedule rows have the new columns.
- A migration removes `principal` and `principal_as_of` from `mortgage_terms`.
- Logic tests: the schedule starts from the opening balance and the opening date; a change of the opening balance
  changes the schedule; the warning rule for the first payment date.
