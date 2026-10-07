# 0005 — Schema review clarifications

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

The review of roadmap slice 0.2 (schema baseline) found gaps in spec §5. Some records that later slices need had no entity.
Some rules were not clear enough to put in the schema.

## Decision

Spec changes:

| Section | Change |
|---|---|
| §5.3, §5.5 | Category names and tag names are unique. The comparison ignores case. |
| §5.4 | A transaction has a maximum of one transfer line. The mirror transaction has one line that points back to the source account. |
| §5.6 | A rule must set a merchant, a category or both. |
| §5.7 | Kind fields for recurring plans. `monthDay` only for monthly and yearly plans. |
| §5.8, §5.9 | Bucket events have `undoneAt`. Undo never deletes events. One funding run that is not undone for each income transaction. |
| §5.10 | One active valuation for each account and date. |
| §5.11 | An import batch has a document or a proposal. Batches have `createdAt`. Only `created`, `matched` and `ignored` rows hold an identity. `duplicate` rows do not. |
| §5.14 | Proposals have `createdAt` and `decidedAt`. |
| §5.15 (new) | Inbox dismissals. |
| §5.16 (new) | Forecast snapshots. |
| §5.17 (new) | Audit log. (0006 removed API tokens, sessions and the password hash.) |

## Consequences

- Slice 0.2 adds the tables for §5.15, §5.16 and `audit_log`.
- §5.15 Settings is now §5.18.
