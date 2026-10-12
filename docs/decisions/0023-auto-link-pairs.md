# 0023 — Automatic link for transfer pairs and same-day reversals

Status: approved (owner, 2026-10-12)

## Context

1. When both statements of a transfer are imported, the user must accept each transfer pair by hand, also when the
   user marked that payee as a transfer many times before.
2. A bank fee and its rebate ("MONTHLY ACCOUNT FEE −17.95" and "ACCT BAL REBATE +17.95" on the same day) have
   different payees. The refund rule of decision 0022 looks only at the same payee, so the rebate is labelled Sure
   but not linked. The owner reads this as a false Sure.

## Decision

1. **Transfer pair, automatic link.** The app links a transfer pair (no new mirror) without a question when all are true:
   - the pair rules of §7.3 apply (opposite amount, different on-budget account, ±3 days, both unlinked, last 90 days);
   - exactly one candidate pair exists for the transaction, and for its peer;
   - the payee of one of the two transactions is a learned transfer (§7.3): the user confirmed it as a transfer before.
   The link is an automatic label: the row needs review at level Sure, with the reason
   "Same amount moved between your accounts. You marked this payee as a transfer before."
   "Looks right" and "Approve all Sure" confirm it. "Not a transfer" (in the editor) unlinks the pair and records the
   pair "no" (decision 0016). In all other cases the transfer pair question stays.
2. **Same-day reversal, refund candidate.** Decision 0022 adds a second kind of candidate purchase: a spending
   transaction in the same account, with the same expense category as the refund and the same absolute amount,
   dated 0 to 3 days before the refund, with any payee. The other candidate rules of 0022 apply
   (not already refunded, automatic link only when exactly one exact candidate, otherwise the question).
   The reason for this kind is "Same amount and category as <payee> on <date>".
3. Both links are written only by app writes (import, automatic label, approval), never by a read and never on a
   category that the user picked in the editor (decision 0022).

## Consequences

- Spec §7.3 (transfer detection, refund) changes.
- Logic tests: a pair with a learned transfer payee links; a pair without one asks; two candidates ask;
  "Not a transfer" stays answered; a fee and a same-day rebate with other payees link; a rebate 4 days later does not;
  a rebate in another category does not.
