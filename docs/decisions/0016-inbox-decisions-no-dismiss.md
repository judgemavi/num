# 0016 — Inbox decisions instead of dismiss

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

The app's purpose includes financial hygiene. A generic "dismiss" lets the user avoid an item without an answer.
Some items are questions where "no" is a correct answer; without a recorded "no", a false guess stays in the Inbox.

## Decision

- Remove generic dismiss, the Dismissed view and "Review one by one".
- Each item kind has explicit answers; a "no" answer is a recorded decision (spec §5.15).
- The whole Inbox row opens the transaction editor (chevron). Suggestion chips stay.
- The editor's rule checkbox becomes an inline rule builder with a live preview.

## Consequences

- Migration: `inbox_dismissals` becomes `inbox_decisions` (`item_key`, `decision`, `reason`, `decided_at`).
  Existing dismissals are not kept (pre-release).
