# 0007 — Interest rates in thousandths of a percent

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- Basis points keep only 2 decimal places of a percent.
- Many real rates have 3 decimal places. Example: mortgage rates in eighths, such as 6.875%. Example: 4.840%.
- If the app rounds a rate, payoff and interest calculations are wrong.

## Decision

- Store interest rates as integers in thousandths of a percent. The field names end in `MilliPct`.
  Example: 6.875% = `6875`.
- `accounts.interestRateBps` becomes `interestRateMilliPct`. `mortgage_terms.rateBps` becomes `rateMilliPct`.
- The user types a percent with a maximum of 3 decimal places. The allowed range is 0% to 1000%.
- Conversion between percent text and `MilliPct` is in `packages/shared`.

## Consequences

- Slice 1.1 adds a migration that renames the two columns.
