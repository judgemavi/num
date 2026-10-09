# 0020 — Remove hidden systems

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

An audit found internal systems that add code and risk but do not help one user with a small book.

## Decision

- No CHECK constraints in the database. The app validates with Zod. Keep foreign keys and unique indexes.
- Hard delete for financial records. The audit log keeps the deleted record. Documents keep the soft delete.
- `reconciled` is calculated from checkpoints, not stored.
- Month close is a "reviewed" mark: no lock, no stored summary, no reopen reason.
- Remove the forecast snapshot and the accuracy record. A read never writes.
- Remove the perf scripts, the payee backfill script, `integerSum` and dead code.
- Import undo does not read the audit log.
- Squash all migrations into one baseline before cutover. The owner deletes the local test data one time.
- Keep: the audit log, the matching engine (decision 0017), the migration hash guard.
