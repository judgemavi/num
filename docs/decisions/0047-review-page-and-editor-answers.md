# 0047 — Needs review is its own page, and the editor gives all answers

Status: approved (owner, 2026-10-14)

Changes decision 0021 (the Needs review view and its level groups).

## Context

Needs review is the Transactions table with the server filter `needsReview` on. With the filter on, the table changes:
it shows group rows (Sure, Likely, Maybe, Questions), it ignores the sort order, and the Balance column is empty.
The Review column shows one-click answers in each row. Thus there are two ways to answer a row: a button in the row
and Save in the editor. The owner wants one table that looks the same in both views, and one way to answer.

## Decision

1. **Two routes, one table.**
   - `/transactions` shows all transactions.
   - `/transactions/review` shows only the transactions that need review.
   - The two routes use the same table component, the same columns and the same sort control. The table has no
     group rows. The query parameter `needsReview` is removed. The API keeps the review list as its own read.
2. **Status column.** The Review column is removed. A Status column shows a `Badge` only when the row needs review:
   - a row with a suggestion or an automatic label: its level (Sure, Likely, Maybe).
   - a row with a question or with no suggestion: "Needs review".
   - other rows: nothing (design.md §6: show a status only when it is not the default).
3. **No buttons in rows.** A click on a row opens the transaction editor. Save is the answer (design.md §6a).
4. **A question is a field in the editor.** The editor shows the field filled with the proposed answer:
   - Transfer pair: "What is this?" is Transfer, with the other account and its matched transaction.
     Save as a transfer accepts the pair. Save as another choice records `not_transfer`.
   - Refund of which purchase: the `Refund of…` field shows the candidate purchases first.
     Save with a purchase links it. Save with "No purchase" records `not_linked`.
   - Which payment: a new field "Payment for…" (Combobox) shows the plan and the due date. It starts empty, because
     more than one transaction can be that payment. Save with the payment links the transaction to it.
   An answer of "no" records the decision, so the question does not come back (as in decision 0045).
5. **A changed recurring amount is not in Needs review.** The user answers it on the Recurring plan screen, which
   already shows changed amounts.
6. **Approve all.** "Approve all Sure · N" and "Approve all Likely · N" are in the page header of
   `/transactions/review` only. They use the filters of the page, as before.
7. **Navigation.** Both pages show two tabs (links) in the page header: "All" and "Needs review · N". A tab link does
   not keep the search and the filters: each page starts with its defaults. The Home card and the hygiene checks
   link to `/transactions/review`.

## Consequences

- Spec §7.3 (Needs review) and §14 (Screens: Transactions) change. `docs/design.md` §6a changes: "Needs review is the
  Transactions table with the Needs review filter on" becomes "Needs review is its own route with the same table".
- Removed: `needsReview` in the list schema, the group rows, `ReviewAnswers`, the Review column, the
  `recurring_changed` question in Needs review and its count in the hygiene check.
- New: the route `/transactions/review`, the Status column, the "Payment for…" field, the question fields filled in
  the editor, and the submit logic that records a "no" answer.
- More clicks for Maybe rows and questions: each one opens the editor. Approve all stays the fast path for Sure and
  Likely.
- No schema change and no migration.
- Logic tests: Save as a transfer accepts the pair and Save as another choice records `not_transfer`; Save with
  "No purchase" records `not_linked` and the refund question does not come back; Save with "Payment for…" links the
  occurrence; the review read returns the rows in the requested sort order; a changed recurring amount is not in the
  review read.
