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
| 0.5 Setup | First-run setup: currency, default category set (§7.0). Currency minor units from ISO 4217. Amounts are milliunits (decision 0037). | Tests: setup runs only one time. A currency change is a relabel at any time (decision 0037). Conversion to milliunits is correct for JPY (0), CAD (2) and KWD (3). |
| 0.6 Backups (on hold: needs discussion, decision 0011) | Pre-migrate backup (spec §13): a consistent copy before pending migrations, keep the last 10, no copy of a new empty database. "Download backup" on Settings → Backup: one archive with a consistent database copy and `uploads/`. | Tests: copy only when a migration is pending; retention of 10; the archive contains a readable database. |

## Phase 1 — Ledger core

Goal: accounts and transactions are correct.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 1.1 Accounts | Account CRUD, kinds, class, onBudget, card fields, balances (§5.1, §7.1). | Tests: balance = opening + transactions, for transaction accounts and valuation accounts. Kind change across class is rejected. |
| 1.2 Categories and tags | Categories, groups, tags (§5.3, §5.5). | Tests: kind change only for an unused category. Group delete moves its categories to no group. Archive and restore. |
| 1.3 Transactions | Transactions, lines, mirror transfers, status (§5.4). | Tests: lines must sum to the amount. Edit and delete of a transfer update both sides in one DB transaction. Self-transfer is rejected. Reconciled records cannot change. Mortgage payment with principal transfer and interest line is correct. |
| 1.4 Transactions screen | List with server pagination, search, filters (account, category, merchant, tag, date, uncategorized) and sort. URL state = API query (decision 0004). Detail, edit lines. Formatting with `Intl` in the browser. | Owner check: URL reload, back and forward keep the state. Locales `fr-CA` and `en-US` format correctly. With 50,000 transactions in the DB, each filtered page of 50 loads in less than 200 ms on the NUC. |

## Design

| Slice | Contents | Acceptance criteria |
|---|---|---|
| D.1 Design system | `docs/design.md` (decision 0009). Tokens in `index.css` mapped to shadcn variables. Self-hosted Archivo. Shell: desktop sidebar with nav groups and phone bottom tabs with the More sheet. Components in `apps/web/src/components/`: PageHeader, SummaryStrip, ListCard (group header, row), SidePanel, Amount, IconTile, Progress, SplitBar, Chip, Pill, Count, Choice cards, Reveal, Disclosure, the 4 illustrations. Restyle setup, Accounts (grouped list, net worth strip, new account dialog with the kind picker of §9) and Settings. | Owner check against `docs/design/signal-reference.html`: same tokens, type, spacing and patterns. No request to Google Fonts. Layout works at 390px. Touch targets ≥ 44px. No hand edits in `components/ui/`. No tests (UI only). |

| D.2 Compact filters and Settings subpages | Decision 0010. Filter bar component (design.md §6, Filters) used on Transactions and Accounts (archived switch moves into it). Settings subpages with sub-navigation: Groups, Categories (sorted by name; group shown on each row; filter by group), Tags, Backup (link the 0.6 page). Migration: remove `category_groups.sort_order`, add a unique lower(name) index on groups. Remove the reorder route and UI. | Owner check: one-row filter bar; badges for active filters; Settings subpages work at 390px. Tests: group and category lists sort by name without case; duplicate group name rejected. |

## Phase 2 — Capture

Goal: imports are safe and the user can review what needs attention.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 2.1 Documents and parsers | Documents (§5.12). OFX/QFX parser. CSV column-map parser. Preset format and loader. Presets for TD chequing, TD savings, TD credit card and CIBC credit card (§7.2). | Each preset has a synthetic test file. Tests: correct dates, amounts, signs and closing balance for each preset and for OFX. Date order (DMY/MDY) and both sign conventions are tested. |
| 2.2 Import pipeline | Identity, dedupe, matching, batch summary, undo (§5.11, §7.2). | Tests: same file two times → 0 new. Overlapping files → 0 duplicates. Two identical rows on one day in one file → 2 transactions. Undo removes only unedited, unreconciled rows. |
| 2.3 Normalization and suggestions | Normalized payee, rules, payee history, merchant default, promote to rule, transfer detection (§5.6, §7.3). | Table test with 50 or more synthetic payee strings in real bank formats from several countries. Each suggestion has a reason code. Promote suggestion after `promoteAfter` confirmations. |
| 2.4 Inbox | Replaced by R.1 (decision 0021). Inbox screen with all item types from phases 1–2. Dismiss with reason. Text made in the browser from codes. | Owner check list passes. |
| 2.5 Checkpoints | Checkpoints, unlock, difference help (§5.13, §7.5). | Tests: checkpoint only when balances are equal. Reconciled status is set. Unlock is audited. |
| 2.6 Owner import test | No code. The owner creates the accounts and imports the real statements into a local v2 instance. | Each account balance agrees with its latest statement. Importing all files a second time creates zero transactions. The owner writes the defects as issues. |

## Phase 3 — Plan

Goal: recurring plans, buckets and paycheck funding.

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 3.1 Recurring plans | Plans, `amountMode`, occurrences, business-day shift, links, skips, changed, missed, detection (§5.7, §7.4). | Tests: monthly day 31 in February. Biweekly gives 3 paychecks in some months. Weekend shift. One occurrence per transaction. Variable plan: median and lowest of the last 6, fallback when fewer than 3, no "changed amount" items. |
| 3.2 Buckets | Buckets, kinds, category map, events, balances, moves, overspending (§5.8, §7.7). | Tests: balance formula. Each category in one bucket only. Refund increases the balance. Card purchase does not change Unassigned. |
| 3.3 Funding | Unassigned, bills reserved, funding proposal, funding run, undo (§6, §5.9, §7.6). | Tests: proposal order by priority. Sinking and goal amounts for each paycheck. The proposal stops at the smaller of paycheck or Unassigned. A variable paycheck uses its actual amount. Undo removes all events. |
| 3.4 Plan screen | Replaced by R.1 (decision 0021). Monthly plan, goal feasibility (§7.8, §14). | Tests: shortfall calculation and both fixes. Owner check list passes. |

## Phase 4 — Understand

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 4.1 Month close | Decision 0031 removed the month close. This slice has no contents. | None. |
| 4.2 Insights | Changes of a month, category, merchant and tag reports, trends, net worth (§9). | Tests: refund decreases spending. Transfers are not spending or income. Changes calculations (changes against the 3-month median, new merchants, the change month). Savings rate. Net worth at month end. |
| 4.3 Hygiene panel | All checks in §10. | One test for each check: pass case and fail case. |

## Phase 5 — Forecast and mortgage

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 5.1 Forecast | Known and estimated series, card payments, safe to spend (§8, §6). | Tests: card purchase moves cash on the due day only. Bucket spending is not counted two times. Outliers are not included. Variable income uses the median. |
| 5.2 Mortgage | Terms, schedule, payment prefill, payoff, extra payment, valuations (§5.2, §5.10, §9). | Public tests with synthetic loans: monthly and semiannual compounding, weekly, biweekly and monthly payments, compared with values from a published lender calculator. Owner check in the UI: the owner enters the real mortgage terms and compares the schedule with a lender statement. |

## Deploy (when hosting is decided)

| Slice | Contents | Acceptance criteria |
|---|---|---|
| X.1 Deploy | Decision 0011. Docker image, optional off-site backup (for example Litestream), `docs/self-hosting.md` with the access warning (decision 0006) and the owner's chosen hosting as one example. | A person can install with only `docs/self-hosting.md`. The owner deploys, does a test restore, and checks that the app is not reachable without the access proxy. |

## Phase 6 — MCP and cutover

| Slice | Contents | Acceptance criteria |
|---|---|---|
| 6.1 MCP | Part 1: read tools. Part 2: full parity, tools generated from the API (§12, decision 0019). | Tests: every route has a tool. A tool call equals the REST call. `aiCanWrite` false hides and refuses writes. Audit source is `mcp`. Date tools require `asOf`. |
| C.1 Cleanup | Decision 0020. Remove: DB CHECK constraints, soft delete (except documents), stored `reconciled`, month close summary and reopen reason, forecast snapshot, perf and backfill scripts, `integerSum`, dead code. Import undo does not read the audit log. Squash all migrations into one baseline. | All checks pass. A fresh DB has one migration. No `deleted_at` except documents. Tests for logic that changed: reconciled calculation (checkpoint, unlock), hard delete of a transfer pair, import undo and re-import. |
| R.1 Home and Needs review | Decision 0021. Home screen with the financial health cards (§14). Needs review is a filter on Transactions, with levels Sure, Likely and Maybe and approve by level. Remove the Inbox and Plan screens. Move Plan content to Home, goal feasibility to Buckets, the forecast chart to Insights, detected recurring to Recurring, import problems to Imports. | All checks pass. Tests: needs-review set and levels, bulk approve with filters and a changed count, recorded "no" decisions stay. Owner check list passes. |
| R.2 Insights timeline and donut | Decision 0030. One timeline with actual and forecast income, spending and balance. A two-level spending donut (groups, categories). Merchant and tag lists. The period selector (1, 3, 6, 12, All, Custom). Remove the separate forecast chart, the trend chart and the "Show" selector. | All checks pass. Tests: forecast monthly income and spending (recurring income, bills, variable spending; card payments are not spending); the `asOf` month split into actual and forecast parts; group totals with "No group", "Uncategorized" and refunds. Owner check list passes. |
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
