# 0056 — Detect recurring transfers and loan payments

Status: approved (owner, 2026-10-14)

## Context

1. Decision 0054 groups a transaction with no merchant by its category, else by its exact amount. It does not group
   a split or a transfer.
2. A mortgage payment is a loan payment: one transaction with an interest line and a transfer line to the mortgage
   account (§5.4). It has no merchant. Thus detection does not propose it.
3. Without a plan, the forecast does not include the payment (§8: the known series uses plans). The mortgage interest
   is only in the estimated series, and the principal is in no series.
4. Detection proposes only bills and income. A plan for a transfer must have the target account.

## Decision

1. **Group.** A transaction with no merchant and with exactly one transfer line goes in the group of its account and
   the target of that line. This includes a plain transfer and a loan payment. Only money out is grouped. Money in is
   the other side of a transfer, and the plan of the account that sends the money covers it.
2. The run, gap and amount rules of §7.4 and decision 0054 do not change.
3. **Proposal.** A proposal has `transferAccountId`. The key of a transfer proposal uses `transfer-<id>`.
4. **Covered.** A plan of the same account with no merchant and with the same transfer target covers a transfer
   proposal.
5. **Detected list.** The name of a transfer proposal is the name of the target account. "Add a recurring transfer"
   creates a transfer plan to that account at once. A plan to a mortgage account then links its payments
   automatically as mortgage payments (§7.3).

## Consequences

- The mortgage payment shows in Detected. After the person adds it, the forecast includes the full payment.
- A transfer of a regular amount to savings, a loan or an investment account shows in Detected.
- A card payment with a different amount each time is not detected, because its amounts are not within 10%.
