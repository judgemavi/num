# 0013 — Mirrors and linked transfer pairs

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

A transfer pair can be an app-created mirror, or two real transactions that the user linked (for example two imported
rows of a card payment). The code treated both the same. An unlink then deleted a real imported row, changed a balance,
and blocked the row from a new import.

## Decision

- `transactions.mirror` (boolean) marks only the mirrors that the app creates. An import match sets it to false.
- Unlink, delete or a money change of one side deletes or rewrites the peer only when the peer is a mirror.
  A non-mirror peer is only unlinked; its line becomes uncategorized.
- Backfill for existing data: false (safe: no automatic delete) except where the case is clear
  (the peer has an import row and this transaction has none and has one transfer line).

## Consequences

- Slice 2.4a adds the column in its migration (0007) and fixes the transfer services, including the existing
  transfer-pair accept.
