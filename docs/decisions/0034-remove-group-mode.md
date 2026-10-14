# 0034 — Remove the editor's group mode

Status: accepted (owner, 2026-10-14)

## Context

1. The transaction editor has a group mode. It applies one category, transfer or merchant to many selected
   transactions of one account.
2. Spec §5 says that group mode "stays available for bulk edits that the user starts (for example from a selection on
   Transactions)". Transactions has no selection. Since commit c5d66d6, no screen opens group mode.
3. Bulk answers have a live path: "Approve all Sure" and "Approve all Likely" (decision 0021).
4. The route `POST /api/transactions/group` is not only for group mode. The one-click answer on a Needs review row
   calls it with one transaction. The MCP tool of this route applies one answer to many rows.
5. The owner decided: "we dont need group mode".

## Decision

1. Remove the group mode of the transaction editor: the group editor, the `groupIds` input and the group choices of
   "What is this?".
2. Keep `POST /api/transactions/group` and its MCP tool. Keep the service function behind it.
3. Remove `GET /api/transactions/payee-count` and its MCP tool. Only the old grouped Inbox called it, and no screen
   calls it now.
4. Change spec §5: the editor has no group mode.

## Consequences

- Spec change: §5 (Needs review). `docs/design.md` loses the group mode paragraph.
- Shared schemas for the payee count are removed. The group request and result schemas stay.
- The single-save result still has the optional fields `applied` and `skipped`. The API never sets them. A web form
  reads them. This is an open point for the owner.
