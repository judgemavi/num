# 0014 — Sweep: shared editors, derived card statements, direction-based choices

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08
Changed by decision 0057 (2026-10-14): a card has no statements and no due dates. The app learns the payment day from the payments.

## Context

The owner's first test with real data found that the Inbox form is too heavy for about 300 transactions, merchants are
never created, card statement days move each month, and credit limit and card interest do nothing.

## Decision

- **Shared editors and one dialog host** (design.md §6b). Create on the spot in every picker.
- **Inbox groups uncategorized transactions by payee**, with suggestion chips; the editor has group and queue modes.
- **"What is this?" follows the direction of the money:** money out = Spending · Transfer · Split; money in = Income ·
  Refund · Transfer · Split. Category lists follow the choice. Transfers have no merchant.
- **Merchants and rules are created in the flow** (merchant name from the payee; "Always do this for <payee>").
- **Cards:** remove statement day, due day, credit limit and card interest. Statements are card checkpoints; the due
  date comes from history (median gap to the next payment, else 21 days). Keep "How you pay".
- **Opening balance is optional**, with suggestions from the first statement and from reconcile (spec §5.1).
- **"On budget"** is labelled "Use this account's money in my budget", under More details.

## Consequences

- A migration removes `accounts.statement_day`, `accounts.due_day`, `accounts.credit_limit` and clears
  `interest_rate_milli_pct` on credit cards.
- Existing screens move their dialogs to the dialog host.
