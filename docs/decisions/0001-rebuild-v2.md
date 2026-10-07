# 0001 — Rebuild as v2

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The purpose of the app is now: know where money goes, plan future spending, and keep good financial hygiene.
- v1 copies the GnuCash ledger: commodities, lots, prices, equity accounts, categories as accounts, 5 reconcile flags.
  This model is too large for the purpose.
- In v1, the core model changed many times in a short period: account types, budgets, categories.
  There was no fixed spec to stop these changes.
- v1 has a Python learning service (scikit-learn, statsmodels). For one user with approximately 850 transactions,
  rules and payee history give almost the same result. The service adds a second runtime and more failure points.
- Agents changed the live database directly. The backups were in `/tmp`.

## Decision

- Write a fixed domain spec (`docs/spec.md`). Changes need a decision record.
- Build v2 on a new schema. Port the v1 data with one verified script.
- Remove ML. Use rules, payee history and arithmetic.
- Categories are a separate table with a kind (`income | expense`).
- Transactions belong to one account. Lines carry categories. Transfers are mirror transactions.
- Budgets and goals become buckets (envelopes). Recurring plans stay for timing and statement matching.
- One currency for each book. (Changed by 0002: the currency is a setting, not CAD.)
- MCP write tools create proposals only.
- Cloudflare Access protects the app. The app also verifies the Access token.

## Consequences

- v1 features that are not in the spec are removed. The list is in spec §3.
- The v1 database stays unchanged. v2 gets a new database from the port script.
- The owner uses Claude through MCP for PDF statements and merchant research.
