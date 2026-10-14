# 0051 — Bulk edit and approve from a row selection

Status: approved (owner, 2026-10-14)
Changed by decision 0053 (2026-10-14): a loan payment cannot be selected. The tooltip is "Loan payments are changed one
at a time." The skip reason `split` is `loan_payment`.

## Context

1. Needs review has "Approve all Sure" and "Approve all Likely" (§7.3). All other rows are answered one row at a time
   in the editor.
2. Decision 0034 removed the group mode of the transaction editor. No screen has a row selection.
3. The owner wants to select rows and set the category, the merchant and other details on all of them in one action.
4. The service behind `POST /api/transactions/group` (`inbox-group.ts`) applies one category, transfer or merchant to
   many transactions of one account. It skips rows that have a split or a category.
5. With a selection, "Approve all Sure" and "Approve all Likely" do the same job as "select, then Approve". The owner
   decided: one mechanism only.

## Decision

1. **Selection.** The transaction table on `/transactions` and on `/transactions/review` has a checkbox column.
   - A click on the checkbox selects the row. A click on another part of the row opens the editor, as before.
   - Shift and click selects a range of rows.
   - The header checkbox selects all rows on the current page. A selection does not go across pages.
   - A row with more than one line (a split) cannot be selected. Its checkbox is disabled, with the tooltip
     "Split transactions are edited one at a time."
   - The selection is state of the screen. It clears when the page, the filters or the sort order change.
2. **Action bar.** When one or more rows are selected, a bar shows at the bottom of the screen:
   "N selected", "Approve · N", "Edit…" and "Clear".
   - "Approve" applies the label or the suggestion of each selected row as a confirmation. A row with no suggestion
     or with a question is skipped. The count on the button is the number of rows that it approves. There is no
     confirmation. The toast shows the number of approved transactions.
   - "Edit…" opens the bulk editor through `openEditor(...)` (§6b). There is no dialog in the screen.
3. **No "Approve all" buttons.** The page header of Needs review has no "Approve all Sure" and no
   "Approve all Likely". To approve many rows, the person selects a page (sorted by confidence, high to low, by
   default) and clicks "Approve", one page at a time.
4. **Bulk editor.** Each field starts as "No change". Only a field that the person changes is written.
   - The header shows the count, the account (or "N accounts"), the date range and the total.
   - "What is this?": "No change", a category, or Transfer with the other account. Transfer is available only when
     all selected rows are in one account. A row in the other account itself is skipped.
   - The category choices follow the direction, as in the single editor (Spending or Refund: expense categories;
     Income: income categories). When the selection has money out and money in, "What is this?" has only
     "No change" and Transfer.
   - Merchant: a merchant, or "No merchant".
   - Tags: "Add tags" and "Remove tags". The editor does not replace all tags of a row.
   - Below the fields: a short list of the selected rows (date, payee, current category, amount).
   - The editor does not change the date, the amount, the description, the account or the line memos. These are
     different for each transaction.
5. **Write.** Save writes at once. There is no confirmation. One service call writes all rows in one transaction,
   with one audit entry for each row. Each changed row counts as a confirmation for learning.
   - A row with an open question that gets a category records the "no" answer (`not_transfer`, `not_linked`), as the
     single editor does.
   - A reconciled row is skipped for a transfer.
   - The result has the count of changed rows and the skipped rows with a reason code. The toast shows them.
     Example: "10 changed · 2 skipped".
6. **API.**
   - `POST /api/transactions/approve` takes the selected ids (one page at most), not a level and the filters.
     Its MCP tool changes the same way.
   - The bulk edit request has the ids (one page at most) and the patch. The service in `inbox-group.ts` becomes the
     bulk edit service with the rules above. The route and its MCP tool keep one path for one answer and for many.

## Consequences

- Decision 0021 changes: no approve by level in the page header. Decision 0034 changes in part: the editor still has
  no group mode, but a separate bulk editor opens from a selection.
- Spec §1 (principle 5 wording), §5, §7.3 and §12 change. `docs/design.md` §6 (toast rule for "Approve all") and §6a
  change: checkbox column, action bar, bulk editor, no "Approve all" buttons.
- The action bar is a new component: a floating ink (`#17171C`) pill with white text, bottom centre, with the dialog
  shadow. `docs/design.md` §6 gets this component.
- The web app adds the shadcn `Checkbox`.
- Logic tests: approve of selected ids (skips rows with no suggestion or a question); bulk edit skip reasons (split,
  reconciled, other account, transfer target); "No change" fields; tags added and removed; question rows record the
  "no" answer; one audit entry for each row. The tests of approve by level with filters and a changed count change
  to ids.
- A large backlog (for example, after the first import) takes one Approve for each page.
