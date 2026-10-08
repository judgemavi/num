# 0018 — Sweep 3: inline forms, refund link, mortgage table, "Recurring"

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Decision

- **Reuse forms, not dialogs.** Every picker's first option is "+ Create new <thing>". It opens that entity's form inline.
  Editors do not stack (design.md §6b). This removes the "created item not selected" problem.
- **Refund link.** When the choice is Refund, an optional "Refund of…" picker lists recent spending (90 days, same payee
  or merchant first). The purchase's category is used. Both transactions show the link. Partial refunds are allowed.
  There is no refund tracking workflow (spec §3).
- **Mortgage schedule table** on the mortgage account: every payment, by year, with past actual payments next to the
  scheduled ones.
- **"Recurring"** is the user-facing name of recurring plans everywhere ("Add a recurring payment", "Add recurring income").
  "Plan" is only the Plan screen.

## Consequences

- Migration: `transactions.refund_of_id` (nullable).
