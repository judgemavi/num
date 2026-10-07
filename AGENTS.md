# Instructions for coding agents

Writing standard: ASD-STE100 (Simplified Technical English). Use it for all docs, PR descriptions and commit messages.

## Sources of truth

1. `docs/spec.md` — what the app is. Do not change it.
2. `docs/roadmap.md` — the build order and acceptance criteria.
3. `docs/decisions/` — approved decisions.

If the spec is not clear, or if two documents do not agree: **stop and ask the owner.** Do not guess. Do not design a new concept.
If you think the spec is wrong, write a proposed decision record (`docs/decisions/NNNN-title.md`, status "proposed"). Then stop.

## Work rules

- Do one roadmap slice at a time. Use a branch from `v2` with the name `v2/<slice>-<short-name>`. Example: `v2/2.2-import-pipeline`.
- Do not commit to `main`. Do not merge. The owner merges after review.
- Do only the work in the slice. Do not add features, screens, fields or settings that the spec does not have.
- Do not leave TODOs, placeholders or partial features. If you cannot complete an item, stop and tell the owner.
- Do not add compatibility code, aliases or shims. v2 has no users before cutover.
- Do not add a dependency without a reason in the PR description.
  The dependency license must be compatible with AGPL-3.0 (decision 0003).

## Data safety

- Do not run SQL by hand on any real database. Do not "fix" data with scripts.
- The `v1` branch is private and read-only. Read it only with `git show v1:<path>`.
  Do not check it out, merge it, rebase it or push it.
- Tests must use temporary databases.
- Money is integer cents. Do not use floating-point numbers for money.

## Open source rules

- Do not put personal data in the repository: real statements, names, merchants, balances or account numbers.
  Make synthetic test fixtures.
- Do not write values for one country, bank or currency in code. Use settings and presets (spec §2.8, §7.2).
- The backend has no time zone and no locale. Do not call "today" on the server. Use `asOf` from the request (spec §4).
- The API returns codes, integers and ISO strings. Do not return formatted text, numbers or dates (spec §4).
- Make all UI text and all formatting in the browser. Use `Intl` for numbers, currency and dates.

## Code rules

- Put business logic in service functions in `apps/api/src/services/`. Routes and MCP tools only validate input and call services.
- Each service function that writes data uses one database transaction and writes the audit log (§11).
- Keep files under 400 lines. Keep functions small.
- Do not keep dead code.
- Use the existing shadcn components in `apps/web/src/components/ui/`.
- Use plain language in the UI (spec §2.6).

## Verification

Before you open a PR, run all of these. All must pass:

```sh
bun test
bun run --filter api typecheck
bun run --filter web build
bun run --filter web lint
```

For UI changes, write a manual check list in the PR. Do not say that the UI works if a person did not examine it.

## PR description

Write it in ASD-STE100. Include:
1. Slice and spec sections.
2. What changed.
3. How you verified it (commands and results).
4. Manual check list (UI only).
5. Open questions.

Do not write progress logs in the repository. The PR description is the record.
