# 0002 — Open source, ISO-only backend, variable pay

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The owner will publish Num as open source. Other people will use it in other countries, with other banks and currencies.
- The owner wants the backend to use only ISO formats. Only the browser does localization.
- The owner's pay comes every 2 weeks. The amount changes each time.
- The git history of v1 contains personal financial data.

## Decision

- **New repository.** v2 starts in a new repository with a new git history. The v1 repository stays private.
  The v1 port script stays in the private v1 repository. It imports the v2 database package by path.
- **Currency** is a book setting (ISO 4217). One currency for each book. Amounts are integer minor units.
- **Time.** The backend has no time zone. The client sends `asOf` for each request that needs "today".
- **Localization.** The API returns codes, integers and ISO strings. The browser formats and writes all text.
- **Bank formats** are presets (data). OFX/QFX is a built-in parser.
- **Auth modes:** `cloudflare-access` and `password`. API tokens for MCP clients. No mode without auth.
- **Variable recurring amounts.** A plan can be `variable`. The forecast uses the median of the last 6 actuals.
  Goal feasibility uses the lowest of the last 6 actuals.
- **No personal data in the repository.** Test fixtures are synthetic.

## Consequences

- The owner's Cloudflare and Coolify setup is one example in `docs/self-hosting.md`. The code does not need it.
- The owner's real mortgage check (39 payments) is a private test in the v1 repository. The public test uses synthetic values.
- A decision record for the license is necessary before the first public commit (0003).
