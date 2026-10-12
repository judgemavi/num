# 0022 — Link a refund to its purchase

Status: approved (owner, 2026-10-12)

## Context

Matching gives a refund the correct expense category, but it does not link the refund to its purchase.
The row looks complete, but "Refund of" is blank. The user must find each purchase by hand.
The link is optional (decision 0018): some refunds have no purchase in Num (before the first import, or cash).

## Decision

A **refund** here is a positive transaction with one line in an expense category and no linked purchase.

A **candidate** purchase:
- is spending (negative, one line in an expense category, not a transfer),
- has the same payee key (§7.3) as the refund,
- has a date in the 90 days before the refund date (or the same date),
- has a refunded amount, after this refund, that is not more than its own amount (decision 0018).

1. **Automatic link.** Exactly one candidate has the same absolute amount as the refund: the app links the refund
   to it when the refund gets its category (import, automatic label, user label or approval).
   The link is an automatic label: the row needs review at level Sure, with the reason
   "Same payee and amount as the purchase on <date>". "Looks right" and "Approve all Sure" confirm it.
   The link sets the refund's category and merchant from the purchase (§7.3).
2. **Question.** In all other cases with one or more candidates (more than one same-amount candidate, or only
   partial-amount candidates), the row needs review with the question "Refund of which purchase?".
   The row shows up to 3 candidates (same amount first, then the most recent) as one-click answers, and
   "Not linked to a purchase". That answer is a recorded "no" (decision 0016, key `refund_link:<transaction id>`).
3. **No candidate:** no question. The refund stays unlinked.
4. A partial refund (smaller than the purchase) is never linked automatically.
5. A read never writes (decision 0020). The automatic link is written by the same service write that sets the category.

Needs review groups are Sure, Likely, Maybe and Questions. "Refund of which purchase?" is in Questions.

## Consequences

- Spec §7.3 (refund, Needs review) changes.
- A logic test covers: one exact candidate links; two exact candidates ask; a partial candidate asks and does not link;
  "Not linked to a purchase" stays answered; the 90-day window; a purchase that is already fully refunded is not a candidate.
