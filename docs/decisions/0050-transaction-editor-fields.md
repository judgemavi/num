# 0050 — Transaction editor fields: no notes, no manual status, Description

Status: approved (owner, 2026-10-14)

## Context

The transaction editor has a "More details" section that is closed at the start. It has notes, tags, the bank text
and a "Cleared" checkbox. The account page has "Mark cleared" and "Mark open" for selected transactions.

- Transaction notes and line memos do the same job. Two text fields for one job are not necessary.
- The person must open "More details" to type the bank text of a new transaction. "Bank text" is not a good name for
  a transaction that the person enters by hand.
- The status (`open` or `cleared`) tells if the bank showed the transaction. The import knows this. A person who
  sets it by hand can make it wrong, and the reconcile help then gives wrong causes.

## Decision

1. Transactions have no `notes` field. A migration removes the column. Line `memo` stays.
2. The UI calls `payeeRaw` "Description". The data name does not change (`payeeRaw`, and `payee` where the API uses
   it now). The editor shows Description for each transaction. On an imported transaction it is disabled, with the
   hint "From the bank import. It does not change." On a manual or MCP transaction the person can change it.
   The server rule stays: the description of an imported transaction does not change (`payee_raw_locked`).
3. The editor has no "More details" section. All fields show. Description and Tags are in the normal order of the
   form.
4. Only the app sets `status`:
   - An imported transaction is `cleared`. A transaction that an import row matches becomes `cleared`.
   - Import undo puts back the status from before the import.
   - A new manual or MCP transaction is `open`. A new mirror is `open`.
   - The create and update input of a transaction has no `status`. The editor has no "Cleared" checkbox.
   - The account page has no "Mark cleared" or "Mark open" and no row selection. The route
     `POST /api/accounts/{id}/clearance`, its service and its MCP tool are removed.
5. The reconcile help keeps the `uncleared` code. The UI shows these transactions as "Pending: not on a statement
   yet".

## Consequences

- Spec §5.4, §7.3, §7.5 and §12 (MCP server instructions) change. `docs/design.md` §6a changes.
- The transaction list search matches the payee and the merchant. It does not match notes.
- The error code `transaction_status_invalid` is removed.
- Logic tests that set notes or status in a write body change. The test of "Mark open" on a reconciled transaction is
  removed with the service.
