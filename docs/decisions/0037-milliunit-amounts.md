# 0037 — Amounts in milliunits

Status: accepted (owner, 2026-10-14)

## Context

1. The app stored each amount as an integer in the minor unit of the book currency: cents for CAD, yen for JPY, fils
   for KWD (spec §4, decision 0002). The scale of a stored amount thus came from the currency.
2. A change of the book currency then changed the value of each stored amount. Example: CAD to JPY makes $12.34
   (`1234`) into ¥1,234, an error of 100 times. Thus the app refused a currency change after the first transaction
   (`currency_locked`).
3. A person who selects the wrong currency at setup had no way to correct it after an import.
4. The browser divided each amount by a power of ten that changed with the currency. Each format function and each parse
   function had to know the exponent of the currency.

## Decision

1. Each stored amount is a signed integer in **milliunits**: thousandths of the major unit, for every currency.
   Examples: $12.34 = `12340`, ¥1,234 = `1234000`, 1.234 KWD = `1234`.
   - ISO 4217 gives a maximum of 3 minor-unit digits for a currency that a bank account uses. Thus each real amount is
     a whole number of milliunits.
   - CLF and UYW have 4 digits. They are units of account, not bank currencies. They are removed from the currency list.
   - The columns stay integer columns. No data migration: v2 has no users before cutover. A book from before this
     decision must be made again.
2. **Step.** The step of a currency is the number of milliunits in one minor unit: `10 ** (3 − digits)`.
   CAD: 10. JPY: 1000. KWD: 1. `currencyStep(code)` in `packages/shared/src/currency.ts` gives it.
3. **Rounding rule.** An amount that the app calculates is rounded to a whole number of steps of the book currency.
   Thus no bucket, plan or transaction gets an amount that the currency cannot have.
   - A half goes away from zero (`roundToStep`, `divideAmount`).
   - A funding share and a per-paycheck share round up (spec §7.6). A share of a surplus rounds down, and the last
     share gets the remainder.
   - Integer divisions use integer math (`divideAmount`). Only a product with a rate (interest) uses a float before
     the rounding.
   - The places: mortgage interest (`mortgageSchedule`), the per-paycheck shares and the surplus shares of the month
     plan, the funding proposal, the median of two amounts (variable plans, plan detection, the forecast), the monthly
     bills (`total / 12`) and the daily spread of the forecast.
4. **Input.** The API refuses an amount that a person or an AI gives when it is not a whole number of steps of the book
   currency. The error code is `amount_too_precise` (400). The check is in the service of each write that takes an
   amount: transactions, accounts (with the mortgage terms), checkpoints, buckets, bucket events, funding runs and
   recurring plans.
   - The web app parses the typed text exactly (no float) and refuses more decimal places than the currency has.
   - An import parses the statement text exactly. A statement amount with more decimal places than the currency has
     is an unreadable line (`too_many_decimals`).
5. **Display.** The browser rounds an amount to the step with integer math, then formats it with `Intl` and the digits
   of the currency.
6. **Currency change.** `PATCH /api/settings/currency` is allowed at any time. It is a new label only: stored amounts do
   not change, and the app does not convert them (no exchange rate). The error code `currency_locked` is removed.
   - Settings gets a "Currency" subpage with a currency picker and the help line "Only the symbol changes. Amounts are
     not converted." The spec list of Settings subpages (§14) changes for this.
7. The MCP server instructions and the tool descriptions say: "Amounts are integer milliunits: 1000 is one unit of the
   book currency."

## Consequences

- Spec §2, §4, §5.1, §5.7, §7.6, §12 and §14 change. `AGENTS.md`, `README.md`, `docs/roadmap.md` (slice 0.5) and
  `docs/design.md` (hero amount) change. This decision changes decision 0002 (amounts are minor units).
- Tests and fixtures use milliunits.
- After a change to a currency with fewer digits (example: CAD to JPY), a stored amount can have more precision than
  the new currency. The browser shows it rounded. The API refuses a write that sends that amount again.
  An edit sends only the fields that changed (partial PATCH, branch c.10), thus an unchanged amount is not sent and
  the edit is not refused. New calculated amounts use the step of the new currency.
- An amount field in the web app shows the rule of the book currency at once ("Use no more than 2 decimals.",
  "Use whole amounts.") when the typed text has too many decimal places (`decimalsError` in `apps/web/src/money.ts`).
- A fixed amount in code (a tolerance, a threshold) must be in steps of the book currency. The app has no such
  amount now: the matching tolerances are percentages and the plan tolerance is a stored amount.
