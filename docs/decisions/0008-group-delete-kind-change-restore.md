# 0008 — Group delete, category kind change and restore

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

The review of slice 1.2 found three cases that the spec did not cover:
delete of a category group, change of a category kind, and restore of archived records.

## Decision

- The user can delete a category group. After a confirmation, its categories move to no group.
- The user can change the kind of a category only when no transaction line uses it and it is not in a bucket.
  Otherwise, the user makes a new category.
- The user can restore archived accounts, categories, tags, merchants, rules, plans and buckets (spec §2.4).
- The spending and income test moves from slice 1.2 to slice 4.2, where reports are built.

## Consequences

- Slice 1.2 adds restore for categories and tags, and also for accounts (slice 1.1 had archive only).
- Each later slice that adds archive also adds restore.
