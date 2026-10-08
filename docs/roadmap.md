# Num v2 — Roadmap

Writing standard: ASD-STE100 (Simplified Technical English).

This file gives the build order for `docs/spec.md`. Each phase has slices. Each slice is one branch and one pull request.
A slice is complete only when all of its acceptance criteria pass.

## Repositories

| Branch | Visibility | Contents |
|---|---|---|
| `main` | Public | v2 code, docs, synthetic test fixtures. New git history (starts with the v2 docs). |
| `v1` | Local only | v1 code and history. Reference only. A pre-push hook blocks it. Delete it after cutover. |

v2 does not port v1 data. The owner imports the statements again to test v2.

## Rules for all phases

- Work on slice branches from `main`. The owner merges.
- Do not change, merge, rebase or push the `v1` branch. Read v1 files only with `git show v1:<path>`.
- Do not copy v1 code without change. Read it, then write new code that agrees with the spec.
- Each slice must pass: `bun test`, API type check, web build, lint with zero new warnings.
- Each slice that changes the UI must include a manual check list in the PR. The owner does the check in a browser.
- Write tests only for logic (decision 0004). Do not write tests for simple CRUD, UI rendering or framework behavior.
- Write the PR description in ASD-STE100. Include: spec sections, what changed, how you verified it.
- Do not put personal data in the repository (spec §15).

## Phase 0 — Foundation

Goal: an empty app that is safe to deploy, for the owner and for other people.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 0.1 New repository | Monorepo (Bun workspaces): `apps/api`, `apps/web`, `packages/db`, `packages/shared`. The web app imports only `packages/shared` (decision 0004). Hono serves the built web app. Add the shadcn UI components with the shadcn CLI. Use the tooling settings from `v1` as a reference. `docs/`, `AGENTS.md` and `LICENSE` are already in the repository. Keep `LICENSE` (AGPL-3.0, decision 0003). Set `"license": "AGPL-3.0-only"` in each `package.json`. Add `README.md`, `CONTRIBUTING.md`. Add the `typecheck` script to `apps/api`. | App starts. One health route. One web shell with the 8 nav items (§14). No Python. No v1 history. Search the repository for the owner's names, banks' account numbers and balances: zero results. |
| 0.2 Schema baseline | Drizzle schema for all entities in §5. One baseline migration. | Fresh DB creates. `PRAGMA integrity_check` = ok. `PRAGMA foreign_key_check` is empty. Migrations run two times without change. |
| 0.4 API conventions | `asOf` validation, error codes, audit log writer (§4, §11). | `@hono/zod-openapi` route pattern and OpenAPI document. Shared list-query schema and paged response (decision 0004). Tests: a date-dependent route without `asOf` → 400. Each write service creates one audit row with `before` and `after`. `sort` with an unknown column → 400. |
| 0.5 Setup | First-run setup: currency, default category set (§7.0). Currency minor units from ISO 4217. | Tests: setup runs only one time. Currency cannot change after the first transaction. Minor-unit conversion is correct for JPY (0), CAD (2) and KWD (3). |
| 0.6 Deploy | Dockerfile, pre-migrate backup, optional Litestream, optional uploads copy, "Download backup", `docs/self-hosting.md` (generic Docker + example: Coolify with Cloudflare Tunnel and Access). | A person can install with only `docs/self-hosting.md`. The guide starts with the access warning (decision 0006). Owner check: from the LAN and from the internet, the app port and any Coolify-generated URL do not respond. The subdomain without a Cloudflare Access login does not show the app or MCP. Owner deploys to the NUC with stop-first. Owner does a test restore from backup to a new volume. The app starts. |

## Phase 1 — Ledger core

Goal: accounts and transactions are correct.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 1.1 Accounts | Account CRUD, kinds, class, onBudget, card fields, balances (§5.1, §7.1). | Tests: balance = opening + transactions, for transaction accounts and valuation accounts. Kind change across class is rejected. |
| 1.2 Categories and tags | Categories, groups, tags (§5.3, §5.5). | Tests: kind change only for an unused category. Group delete moves its categories to no group. Archive and restore. |
| 1.3 Transactions | Transactions, lines, mirror transfers, status (§5.4). | Tests: lines must sum to the amount. Edit and delete of a transfer update both sides in one DB transaction. Self-transfer is rejected. Reconciled records cannot change. Mortgage payment with principal transfer and interest line is correct. |
| 1.4 Transactions screen | List with server pagination, search, filters (account, category, merchant, tag, date, uncategorized) and sort. URL state = API query (decision 0004). Detail, edit lines. Formatting with `Intl` in the browser. | Owner check: URL reload, back and forward keep the state. Locales `fr-CA` and `en-US` format correctly. With 50,000 transactions in the DB, each filtered page of 50 loads in less than 200 ms on the NUC. |

## Phase 2 — Capture

Goal: imports are safe and the Inbox works.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 2.1 Documents and parsers | Documents (§5.12). OFX/QFX parser. CSV column-map parser. Preset format and loader. Presets for TD chequing, TD savings, TD credit card and CIBC credit card (§7.2). | Each preset has a synthetic test file. Tests: correct dates, amounts, signs and closing balance for each preset and for OFX. Date order (DMY/MDY) and both sign conventions are tested. |
| 2.2 Import pipeline | Identity, dedupe, matching, batch summary, undo (§5.11, §7.2). | Tests: same file two times → 0 new. Overlapping files → 0 duplicates. Two identical rows on one day in one file → 2 transactions. Undo removes only unedited, unreconciled rows. |
| 2.3 Normalization and suggestions | Normalized payee, rules, payee history, merchant default, promote to rule, transfer detection (§5.6, §7.3). | Table test with 50 or more synthetic payee strings in real bank formats from several countries. Each suggestion has a reason code. Promote suggestion after `promoteAfter` confirmations. |
| 2.4 Inbox | Inbox screen with all item types from phases 1–2. Dismiss with reason. Text made in the browser from codes. | Owner check list passes. |
| 2.5 Checkpoints | Checkpoints, unlock, difference help (§5.13, §7.5). | Tests: checkpoint only when balances are equal. Reconciled status is set. Unlock is audited. |
| 2.6 Owner import test | No code. The owner creates the accounts and imports the real statements into a local v2 instance. | Each account balance agrees with its latest statement. Importing all files a second time creates zero transactions. The owner writes the defects as issues. |

## Phase 3 — Plan

Goal: recurring plans, buckets and paycheck funding.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 3.1 Recurring plans | Plans, `amountMode`, occurrences, business-day shift, links, skips, changed, missed, detection (§5.7, §7.4). | Tests: monthly day 31 in February. Biweekly gives 3 paychecks in some months. Weekend shift. One occurrence per transaction. Variable plan: median and lowest of the last 6, fallback when fewer than 3, no "changed amount" items. |
| 3.2 Buckets | Buckets, kinds, category map, events, balances, moves, overspending (§5.8, §7.7). | Tests: balance formula. Each category in one bucket only. Refund increases the balance. Card purchase does not change Unassigned. |
| 3.3 Funding | Unassigned, bills reserved, funding proposal, funding run, undo (§6, §5.9, §7.6). | Tests: proposal order by priority. Sinking and goal amounts for each paycheck. The proposal stops at the smaller of paycheck or Unassigned. A variable paycheck uses its actual amount. Undo removes all events. |
| 3.4 Plan screen | Monthly plan, goal feasibility (§7.8, §14). | Tests: shortfall calculation and both fixes. Owner check list passes. |

## Phase 4 — Understand

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 4.1 Month close | Close rules, summary, open again (§7.5). | Tests: a missing checkpoint blocks the close. Open Inbox items block the close. Reopen needs a reason. |
| 4.2 Insights | Month story, category, merchant and tag reports, trends, net worth (§9). | Tests: refund decreases spending. Transfers are not spending or income. Month story calculations (changes against the 3-month median, savings rate). Net worth at month end. |
| 4.3 Hygiene panel | All checks in §10. | One test for each check: pass case and fail case. |

## Phase 5 — Forecast and mortgage

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 5.1 Forecast | Known and estimated series, card payments, safe to spend, accuracy record (§8, §6). | Tests: card purchase moves cash on the due day only. Bucket spending is not counted two times. Outliers are not included. Accuracy record is stored one time for each month. Variable income uses the median. |
| 5.2 Mortgage | Terms, schedule, payment prefill, payoff, extra payment, valuations (§5.2, §5.10, §9). | Public tests with synthetic loans: monthly and semiannual compounding, weekly, biweekly and monthly payments, compared with values from a published lender calculator. Owner check in the UI: the owner enters the real mortgage terms and compares the schedule with a lender statement. |

## Phase 6 — MCP and cutover

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 6.1 MCP | Read tools and proposal tools (§12, §5.14). | Tests: each proposal tool writes only a proposal. Approval uses the UI service function. Proposed rows go through dedupe. Date tools require `asOf`. |
| 6.2 Cutover | Owner imports all statements into the production v2 instance. Stop v1. Delete the `v1` branch. | Owner uses v2 for one full weekly review and one paycheck funding without v1. |

## Reuse from v1

Read these files from the `v1` branch with `git show v1:<path>`. Write new code in v2.

| v1 file | Use in slice | Note |
|---|---|---|
| `apps/api/src/lib/csv-statement.ts` | 2.1 | CSV split, date order, running balance detection |
| `apps/api/src/lib/matching.ts` (`normalizePayee`, `normalizeVendorName`) | 2.3 | Payee cleanup only |
| `apps/api/src/lib/mortgage.ts` | 5.2 | Period rate and schedule math |
| `apps/api/src/lib/recurring.ts` (`occurrenceDate`) | 3.1 | Check the month-end clamp |
| `apps/web/src/components/ui/*` | 0.1 | shadcn components |
