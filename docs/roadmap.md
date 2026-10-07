# Num v2 — Roadmap

Writing standard: ASD-STE100 (Simplified Technical English).

This file gives the build order for `docs/spec.md`. Each phase has slices. Each slice is one branch and one pull request.
A slice is complete only when all of its acceptance criteria pass.

## Repositories

| Repository | Visibility | Contents |
|---|---|---|
| `num` | Public | v2 code, docs, synthetic test fixtures. New git history (starts with the v2 docs). |
| `num-v1` (local folder `../num-v1`) | Private | v1 code and history, the v1 database, the port script, `docs/port-v1.md`, the owner's private tests. Never push it to a public remote. |

## Rules for all phases

- Build v2 in the new repository. Work on slice branches from `main`. The owner merges.
- Do not change v1, except to add the port script and private tests (slice 2.6, 5.2).
- Do not read or write the v1 database, except with the port script. The port script opens it read-only.
- Each slice must pass: `bun test`, API type check, web build, lint with zero new warnings.
- Each slice that changes the UI must include a manual check list in the PR. The owner does the check in a browser.
- Tests must cover each invariant and rule in the spec sections that the slice implements.
- Write the PR description in ASD-STE100. Include: spec sections, what changed, how you verified it.
- Do not put personal data in the repository (spec §15).

## Phase 0 — Foundation

Goal: an empty app that is safe to deploy, for the owner and for other people.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 0.1 New repository | Monorepo (Bun workspaces): `apps/api`, `apps/web`, `packages/db`. Copy the shadcn UI components and tooling settings from `../num-v1`. `docs/`, `AGENTS.md` and `LICENSE` are already in the repository. Keep `LICENSE` (AGPL-3.0, decision 0003). Set `"license": "AGPL-3.0-only"` in each `package.json`. Add `README.md`, `CONTRIBUTING.md`. Add the `typecheck` script to `apps/api`. | App starts. One health route. One web shell with the 8 nav items (§14). No Python. No v1 history. Search the repository for the owner's names, banks' account numbers and balances: zero results. |
| 0.2 Schema baseline | Drizzle schema for all entities in §5. One baseline migration. | Fresh DB creates. `PRAGMA integrity_check` = ok. `PRAGMA foreign_key_check` is empty. Migration test: run two times, no change. |
| 0.3 Auth | Both auth modes, API tokens, dev bypass (§13). | Tests for `cloudflare-access`: no token, bad signature, wrong audience → 401. Valid → 200. Tests for `password`: wrong password → 401. Rate limit works. Cookie flags are correct. Tests for tokens: revoked token → 401. Only the hash is stored. Dev bypass only with `NODE_ENV=development` and `127.0.0.1`. App does not start without a valid `AUTH_MODE`. |
| 0.4 API conventions | `asOf` validation, error codes, audit log writer (§4, §11). | Tests: a date-dependent route without `asOf` → 400. API responses contain no formatted numbers or dates. Each write service creates one audit row with `before` and `after`. |
| 0.5 Setup | First-run setup: currency, password, default category set (§7.0). Currency minor units from ISO 4217. | Tests: setup runs only one time. Currency cannot change after the first transaction. JPY (0 minor units) and KWD (3) amounts are correct. |
| 0.6 Deploy | Dockerfile, pre-migrate backup, optional Litestream, optional uploads copy, "Download backup", `docs/self-hosting.md` (generic Docker + example: Coolify with Cloudflare Tunnel and Access). | A person can install with only `docs/self-hosting.md`. Owner deploys to the NUC with stop-first. Owner does a test restore from backup to a new volume. The app starts. |

## Phase 1 — Ledger core

Goal: accounts and transactions are correct.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 1.1 Accounts | Account CRUD, kinds, class, onBudget, card fields, balances (§5.1, §7.1). | Tests: balance = opening + transactions. Kind change across class is rejected. Archive with a balance needs a confirmation. |
| 1.2 Categories and tags | Categories, groups, tags (§5.3, §5.5). | Tests: refund decreases spending. Transfers are not spending or income. Tag totals are correct. |
| 1.3 Transactions | Transactions, lines, mirror transfers, status (§5.4). | Tests: lines must sum to the amount. Edit and delete of a transfer update both sides in one DB transaction. Self-transfer is rejected. Reconciled records cannot change. Mortgage payment with principal transfer and interest line is correct. |
| 1.4 Transactions screen | List, search, filters (account, category, merchant, tag, date, uncategorized), detail, edit lines. Formatting with `Intl` in the browser. | Manual check list passes, also with browser locale `fr-CA` and `en-US`. A list of 1,000 rows loads in less than 300 ms on the NUC. |

## Phase 2 — Capture

Goal: imports are safe and the Inbox works. The owner's data moves to v2.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 2.1 Documents and parsers | Documents (§5.12). OFX/QFX parser. CSV column-map parser. Preset format and loader. Presets for TD chequing, TD savings, TD credit card and CIBC credit card (§7.2). | Each preset has a synthetic test file. Tests: correct dates, amounts, signs and closing balance for each preset and for OFX. Date order (DMY/MDY) and both sign conventions are tested. |
| 2.2 Import pipeline | Identity, dedupe, matching, batch summary, undo (§5.11, §7.2). | Tests: same file two times → 0 new. Overlapping files → 0 duplicates. Two identical rows on one day in one file → 2 transactions. Undo removes only unedited, unreconciled rows. |
| 2.3 Normalization and suggestions | Normalized payee, rules, payee history, merchant default, promote to rule, transfer detection (§5.6, §7.3). | Table test with 50 or more synthetic payee strings in real bank formats from several countries. Each suggestion has a reason code. Promote suggestion after `promoteAfter` confirmations. |
| 2.4 Inbox | Inbox screen with all item types from phases 1–2. Dismiss with reason. Text made in the browser from codes. | Manual check list passes. Inbox count in the nav. |
| 2.5 Checkpoints | Checkpoints, unlock, difference help (§5.13, §7.5). | Tests: checkpoint only when balances are equal. Reconciled status is set. Unlock is audited. |
| 2.6 Port from v1 (private) | Script in the **private v1 repository**. It opens the v1 DB read-only and writes a new v2 DB. It uses the v2 `packages/db` by path. The mapping is in `docs/port-v1.md` in the private v1 repository. | Report shows each account's balance at each month end: v1 = v2 for all accounts. Counts of transactions, merchants and rules agree. The script stops with an error if a balance does not agree. Owner approves the report. |

## Phase 3 — Plan

Goal: recurring plans, buckets and paycheck funding.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 3.1 Recurring plans | Plans, `amountMode`, occurrences, business-day shift, links, skips, changed, missed, detection (§5.7, §7.4). | Tests: monthly day 31 in February. Biweekly gives 3 paychecks in some months. Weekend shift. One occurrence per transaction. Variable plan: median and lowest of the last 6, fallback when fewer than 3, no "changed amount" items. |
| 3.2 Buckets | Buckets, kinds, category map, events, balances, moves, overspending (§5.8, §7.7). | Tests: balance formula. Each category in one bucket only. Refund increases the balance. Card purchase does not change Unassigned. |
| 3.3 Funding | Unassigned, bills reserved, funding proposal, funding run, undo (§6, §5.9, §7.6). | Tests: proposal order by priority. Sinking and goal amounts for each paycheck. The proposal stops at the smaller of paycheck or Unassigned. A variable paycheck uses its actual amount. Undo removes all events. |
| 3.4 Plan screen | Monthly plan, goal feasibility (§7.8, §14). | Manual check list passes. Shortfall shows both fixes. |

## Phase 4 — Understand

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 4.1 Month close | Close rules, summary, open again (§7.5). | Tests: a missing checkpoint blocks the close. Open Inbox items block the close. Reopen needs a reason. |
| 4.2 Insights | Month story, category, merchant and tag reports, trends, net worth (§9). | Tests: story numbers agree with raw sums. Net worth agrees with account balances. |
| 4.3 Hygiene panel | All checks in §10. | One test for each check: pass case and fail case. |

## Phase 5 — Forecast and mortgage

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 5.1 Forecast | Known and estimated series, card payments, safe to spend, accuracy record (§8, §6). | Tests: card purchase moves cash on the due day only. Bucket spending is not counted two times. Outliers are not included. Accuracy record is stored one time for each month. |
| 5.2 Mortgage | Terms, schedule, payment prefill, payoff, extra payment, valuations (§5.2, §5.10, §9). | Public tests with synthetic loans: monthly and semiannual compounding, weekly, biweekly and monthly payments, compared with values from a published lender calculator. Private test in the v1 repository: the owner's 39-payment check. |

## Phase 6 — MCP and cutover

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 6.1 MCP | Read tools and proposal tools (§12, §5.14). | Tests: each proposal tool writes only a proposal. Approval uses the UI service function. Proposed rows go through dedupe. Date tools require `asOf`. |
| 6.2 Cutover | Run the port again on the latest v1 data. Deploy v2 on the NUC. Stop v1. | Owner uses v2 for one full weekly review and one paycheck funding without v1. |

## Reuse from v1

Read these v1 files as a reference. Write new code in v2. Do not copy v1 history.

| v1 file | Use in slice | Note |
|---|---|---|
| `apps/api/src/lib/csv-statement.ts` | 2.1 | CSV split, date order, running balance detection |
| `apps/api/src/lib/matching.ts` (`normalizePayee`, `normalizeVendorName`) | 2.3 | Payee cleanup only |
| `apps/api/src/lib/mortgage.ts` | 5.2 | Period rate and schedule math |
| `apps/api/src/lib/recurring.ts` (`occurrenceDate`) | 3.1 | Check the month-end clamp |
| `apps/web/src/components/ui/*` | 0.1 | shadcn components |
