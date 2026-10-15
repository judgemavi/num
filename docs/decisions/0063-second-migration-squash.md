# 0063 — Second migration squash and removal of upgrade code

Status: proposed

## Context

1. After the first squash (decision 0020, slice C.1), 14 more migrations were added. Some of them convert old data
   (sort keys, funding runs, checkpoints, open transactions). v2 has no users before cutover, thus this upgrade code
   is debt.
2. The owner wants one baseline migration and no code that exists only for books made by an earlier version.

## Decision

1. All migrations are squashed into one baseline (`0000_baseline`), generated from the schema.
2. The startup step that fills empty sort keys (`fillSortKeys`) is removed. The app writes the sort key on each create
   and rename.
3. The migration tests for old data and their helper (`databaseBefore`) are removed.
4. The fill does not make the emergency bucket (amends decision 0060 item 3). Only the setup makes it.
   `madeBucket` is removed from the fill result.
5. The column `inbox_decisions.reason` is removed. No code writes a value to it.
6. The error code `not_credit_card` is removed. No code uses it.
7. The owner's local database keeps its data. Its migration table gets one row for the new baseline, after a check that
   its schema is the same as the schema of a new database.

## Consequences

- A fresh database has one migration.
- A database that has the old migration rows and no baseline row stops at startup with "Migration 0000_baseline is
  missing".
