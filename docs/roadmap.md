# Num v2 — Roadmap

Writing standard: ASD-STE100 (Simplified Technical English).

This file gives the open work for `docs/spec.md`. Each slice is one branch and one pull request.
A slice is complete only when all of its acceptance criteria pass. Remove a slice from this file when it is merged.
Git history has the finished slices.

## Repositories

| Branch | Visibility | Contents |
|---|---|---|
| `main` | Public | v2 code, docs, synthetic test fixtures. |
| `v1` | Local only | v1 code and history. Reference only. A pre-push hook blocks it. Delete it after cutover. |

v2 does not port v1 data. The owner imports the statements again to test v2.

## Rules for all slices

- AGENTS.md gives the work rules, the verification commands and the PR description.
- Do not copy v1 code without change. Read it, then write new code that agrees with the spec.

## Open slices

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 0.6 Backups (on hold: the owner must discuss it first) | Pre-migrate backup (spec §13): a consistent copy before pending migrations, keep the last 10, no copy of a new empty database. "Download backup" on Settings → Backup: one archive with a consistent database copy. | Tests: copy only when a migration is pending; retention of 10; the archive contains a readable database. |
| X.1 Deploy | Optional off-site backup (for example Litestream) and its restore procedure in `docs/self-hosting.md`. | A person can install with only `docs/self-hosting.md`. The owner does a test restore and checks that the app is not reachable without the access proxy. |
| 6.2 Cutover | The owner imports all statements into the production v2 instance. Stop v1. Delete the `v1` branch. | The owner uses v2 for one full weekly review and one monthly funding without v1. |
