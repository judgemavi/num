# 0015 — Learning instead of Inbox groups

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

The owner does not want to confirm every transaction, and does not want payee groups. The owner wants to see the app
improve from the owner's answers. The owner does not want seed data (no v1 import, no built-in merchant list).

## Decision

- Remove the Inbox payee groups. The Inbox shows one row for each transaction that the app cannot categorize.
- Learn from the first confirmation. Apply it at once to the payee's other uncategorized transactions and to future imports.
- Labels (category, merchant) can be automatic when the app is sure. Money never changes automatically. Transfers and
  splits are never automatic.
- Automatic labels store and show their reason. A filter lists them. A correction is a confirmation.
- A disagreement stops automatic labels for that payee until the confirmations agree again.
- Remove the promote-to-rule Inbox item. Rules stay available and win over learning.
- A starter merchant list may come later only as an optional setting, off by default.

## Consequences

- Migration: `transactions.auto_reason` and `transactions.auto_source_id`.
- `promoteAfter` is no longer used.
