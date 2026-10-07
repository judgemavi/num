# Contributing

## License

Contributions use the GNU Affero General Public License, version 3 (`AGPL-3.0-only`).
A new dependency must have a license that is compatible with AGPL-3.0.

## Personal data

Do not put personal data in the repository.
Do not add real statements, names, merchants, balances, or account numbers.
Test fixtures must be synthetic.

## Work

Read these files before you change code:

- `docs/spec.md`
- `docs/roadmap.md`
- `docs/decisions/`
- `AGENTS.md`

Do one roadmap slice in one pull request.
Do not add a feature, screen, field, or setting that the spec does not have.

## Bank presets

A bank preset is data. It is not code (spec §7.2).
Add a preset file and a synthetic test file for that bank.
A preset must not contain real statements or real account numbers.

## Checks

These commands must pass:

```sh
bun test
bun run --filter api typecheck
bun run --filter web build
bun run --filter web lint
```
