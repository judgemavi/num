# Num — Domain Spec (v2)

Writing standard: ASD-STE100 (Simplified Technical English).

Status: **approved baseline**. This file is the source of truth for the v2 rebuild.
To change this file, write a decision record in `docs/decisions/`. The owner must approve it.

## 1. Purpose

Num is an open-source, self-hosted app. One instance serves one person (one book).

Num helps one person to:
- Know where their money goes.
- Plan future spending.
- Keep good financial hygiene as a routine.

All features must support one of these three loops:

| Loop | When | Time | Result |
|---|---|---|---|
| Weekly review | One time each week | 10 min | Statements are imported. The Inbox is empty. |
| Paycheck funding | At each paycheck | 2 min | The paycheck is assigned to buckets with one click. |
| Monthly close | At the start of each month | 15 min | Balances agree with statements. The month is locked. The month story is available. |

If a screen or feature does not support one of these loops, do not add it.

## 2. Principles

1. **Correct money.** Use integer cents for all amounts. Account balances must agree with bank statements.
2. **Deterministic.** Use rules, history and arithmetic. Do not use ML. The app does not call an LLM.
3. **No silent changes.** The app does not create, change or delete financial records without a user action.
   Each suggestion shows its reason. Example: "Rule: NETFLIX → Streaming".
4. **Reversible.** The user can undo imports and funding. The user can open a closed month again.
   The audit log records each of these actions.
5. **Exceptions only.** The user works on the Inbox. The user does not examine each transaction.
6. **Plain language.** The UI does not use accounting words. Do not show "debit", "credit", "equity", "split" or "ledger".
7. **Small.** Use the smallest possible number of concepts. Each new concept needs a decision record.
8. **For everyone.** The code must not contain one person's banks, data or region as fixed values.
   Bank formats are presets (data). Defaults must be correct for any country.

## 3. Out of scope

Do not build these items:
- More than one user in one instance.
- More than one currency in one book.
- Translations of the UI (v2 is English only, but §4 keeps translation possible).
- Investment holdings, lots and prices.
- Tax preparation.
- Payslips.
- Bank API connections.
- PDF extraction or AI extraction in the app.
- ML models and statistical forecast models.
- Business accounting.
- Attachments on transactions.
- Workflows to track refunds.
- Workflows for personal loans.
- Affordability calculators.

The owner extracts data from PDF statements with Claude through MCP (§12).
The owner finds information about unknown merchants with Claude through MCP.

## 4. Conventions

- **Currency:** Each book has one currency (ISO 4217 code). The user selects it at setup (§7.0).
  The user cannot change it after the first transaction.
  Amounts are signed integers in the minor unit of the currency (for example: cents for CAD, yen for JPY).
  The number of minor units comes from the ISO 4217 table. Tables do not have currency columns.
  In this spec, "cents" means "minor units".
- **Sign:** The sign of an amount is from the view of the account.
  - A positive amount is money into the account. Examples: deposit, refund, card payment received.
  - A negative amount is money out of the account. Examples: purchase, withdrawal, card charge.
  - Thus, a liability has a negative balance. The UI shows it as "Owed $X".
- **Dates and time:** The backend has no time zone and no locale.
  - A calendar date is an ISO 8601 `YYYY-MM-DD` string. It has no time zone.
  - A timestamp is an ISO 8601 UTC string (`...Z`).
  - The backend does not calculate "today". Each request that needs "today" must send `asOf` (`YYYY-MM-DD`).
    The browser sends its local date. If `asOf` is missing, the API returns 400.
  - MCP tools that need "today" have a required `asOf` parameter.
- **Localization:** Only the browser does localization.
  - The API returns raw integers, ISO dates, ISO timestamps and codes. The API does not return formatted numbers,
    formatted dates or formatted currency.
  - The browser formats with `Intl` and the browser locale.
  - The API returns codes and parameters, not English sentences. Examples: Inbox item kinds, error codes, suggestion reasons.
    The browser makes the text. Thus, translation is possible later.
- **Lists:** Filter, sort and page state is in the URL. The URL agrees 1:1 with the API query.
  Pagination is on the server (decision 0004).
- **IDs:** Use UUID text.
- **Delete:** Use a soft delete (`deletedAt`) for financial records. You can archive configuration records (rules, plans, buckets).
- **Audit:** Each change writes one `audit_log` row (§11).

## 5. Entities

### 5.1 Account

An account is a real account at a bank or other institution.

Fields:
- `name`, `institution?`, `kind`, `onBudget` (boolean), `openingDate`, `openingBalance` (cents), `archivedAt?`
- `kind`: `chequing | savings | cash | credit_card | mortgage | loan | investment | property | receivable | other_asset | other_liability`

Rules:
- The kind sets the class. These kinds are liabilities: `credit_card`, `mortgage`, `loan`, `other_liability`.
  All other kinds are assets.
- `onBudget` = true means that the user can assign the money in the account to buckets.
  The default is true for `chequing`, `savings`, `cash` and `credit_card`. The default is false for all other kinds.
  The user can change it.
- Card fields (only for `credit_card`): `creditLimit?`, `statementDay?` (1–31), `dueDay?` (1–31),
  `paymentPolicy` (`full | fixed | manual`), `fixedPayment?`.
- `interestRateBps?` is for savings, cards and loans. It is for information and for payoff calculations.
- Balance of a transaction account = `openingBalance` + the sum of the transaction amounts in the account.
- Balance of an `investment` or `property` account = the latest valuation (§5.10) + the transactions after the valuation date.

The opening balance is a field. It is not a transaction. There is no equity account.

### 5.2 Mortgage terms

Each `mortgage` account has one row of current terms. There is no history of terms.

Fields:
- `principal`, `principalAsOf`, `rateBps`, `compounding` (`monthly | semiannual`)
- `paymentAmount`, `paymentFrequency` (`weekly | biweekly | semimonthly | monthly`), `firstPaymentDate`
- `termEnd`, `amortizationMonthsRemaining`
- `paymentAccountId`, `interestCategoryId`, `propertyAccountId?`

Use the terms to:
- Calculate the payment schedule.
- Fill the principal and interest amounts of a payment before the user confirms it.
- Show the payoff date.

The terms do not create transactions.

### 5.3 Category and category group

- Category fields: `name`, `kind` (`income | expense`), `groupId?`, `essential` (boolean, only for expense), `archivedAt?`.
  The name is unique. The comparison ignores case.
- Group fields: `name`, `sortOrder`. Groups are only for display.
- **Spending** = the sum of the lines in expense categories.
  A refund is a positive line in an expense category. A refund decreases spending.
- **Income** = the sum of the lines in income categories.
- Transfers are not spending. Transfers are not income.

### 5.4 Transaction and lines

Transaction fields:
- `accountId`, `date`, `amount`, `merchantId?`, `notes?`
- `payeeRaw`: the bank text. Do not change it after import.
- `status`: `open | cleared | reconciled`
- `source`: `import | manual | mcp`
- `importRowId?`, `transferPeerId?`

Line fields:
- `transactionId`, `amount`, `memo?`, `tagIds[]`
- A line has `categoryId`, or `transferAccountId`, or neither. A line must not have both.

Rules:
- The sum of the lines must be equal to the transaction amount.
- A transaction has one or more lines.
- A line without a category and without a transfer is **uncategorized**. It shows in the Inbox.
- **Transfers:**
  - A line with `transferAccountId` has a **mirror transaction** in the target account.
  - The mirror amount = −(line amount). The mirror date = the line's transaction date.
  - `transferPeerId` links the two transactions in both directions.
  - If the user edits or deletes one side, update the other side in the same database transaction.
  - A transfer line must not target its own account.
  - A transaction has a maximum of one transfer line.
  - The mirror transaction has one line. Its `transferAccountId` is the account of the source transaction.
- A mortgage payment is one chequing transaction with two lines:
  - A transfer line for the principal. The target is the mortgage account.
  - An expense line for the interest. The category is the interest category.
- The user cannot edit or delete a `reconciled` transaction. First, the user must unlock its checkpoint (§7.5).

### 5.5 Tag

Fields: `name`, `archivedAt?`. The name is unique. The comparison ignores case. A line can have many tags. A tag can be on many lines.

Use tags for trips and projects. Example: "Italy Vacation 2026". Reports can filter and add totals by tag.

### 5.6 Merchant and rule

Merchant fields: `name`, `defaultCategoryId?`, `archivedAt?`. The name is unique. The comparison ignores case.

Rule fields:
- `match`: `exact | prefix | contains | regex`
- `pattern`: the rule compares it with the **normalized payee** (§7.3).
- `accountId?`: if it is set, the rule applies only to this account.
- `merchantId?`, `categoryId?`, `priority`
- `origin`: `manual | promoted`
- A rule must set `merchantId`, `categoryId` or both.

Rules make suggestions. §7.3 tells how the import uses them.
A change to a rule does not change existing transactions.
To change existing transactions, the user selects "Apply to existing". The app shows a preview first.

### 5.7 Recurring plan

A recurring plan is a payment or deposit that the user expects on a schedule.

Fields:
- `name`, `kind` (`income | bill | transfer`), `accountId`, `expectedAmount`, `tolerance` (cents)
- `amountMode`: `fixed | variable`. Use `variable` when the amount changes each time (example: a paycheck).
- `categoryId?` for income and bill. `transferAccountId?` for transfer.
- `merchantId?`
- `startDate`, `freq` (`weekly | monthly | yearly`), `interval`. Example: interval 2 with weekly = biweekly.
- `monthDay?`: 1–31, or −1 for the last day of the month.
- `businessDayShift`: `none | next | previous`
- `endDate?`, `active`
- `fundsBuckets` (boolean, only for income)

Rules:
- Kind fields:
  - `transfer`: `transferAccountId` is necessary. It must not be `accountId`. `categoryId` is empty.
  - `income` and `bill`: `transferAccountId` is empty.
- `monthDay` is only for `monthly` and `yearly`. For `yearly`, the month comes from `startDate`.
- The app calculates occurrences. It does not store occurrences as transactions.
- If a month has fewer days than `monthDay`, use the last day of the month.
- `occurrence_link` fields: `planId`, `dueDate`, and `transactionId` or `skipped` + `reason`.
- An occurrence has a maximum of one link. A transaction has a maximum of one occurrence.
- **Expected amount of a `variable` plan:**
  - For the forecast: the median of the last 6 linked actual amounts.
  - For goal feasibility (§7.8): the lowest of the last 6 linked actual amounts. This is the safe value.
  - If there are fewer than 3 linked actuals, use `expectedAmount` for both.
  - A `variable` plan does not create "changed amount" Inbox items. `tolerance` applies only to linking.

### 5.8 Bucket

A bucket is money that the user keeps for one purpose.
Buckets are virtual. A bucket is a label on on-budget money. Buckets do not move money between accounts.

Fields:
- `name`, `kind` (`spending | sinking | goal`), `priority`, `essential` (boolean), `archivedAt?`
- `categoryIds[]`: each expense category is in a maximum of one bucket.

Settings for each kind:
- `spending`: `refillTo`. Each month, funding brings the balance up to this amount.
- `sinking`: `amount`, `dueDate`, `repeat` (`none | yearly`). Funding is equal at each paycheck until the due date.
- `goal`: `target`, `targetDate?`. Funding is equal at each paycheck until the target date.
  If there is no target date, the goal has a fixed amount for each paycheck.

Bucket events (append only):
- `fund`: money from Unassigned into the bucket.
- `move`: money from one bucket to a different bucket.
- `release`: money from the bucket back to Unassigned.
- Each event has `amount` (positive), `date`, `note?`, `fundingRunId?`, `undoneAt?`.
- Undo of an event sets `undoneAt`. The app does not delete events.

Bucket balance = funds + moves in − moves out − releases + the sum of the lines in the bucket's categories.
Do not count events with `undoneAt`. Do not count events of a funding run with `undoneAt`.
Spending lines are negative. Refund lines are positive.
The balance carries over. There is no reset at the end of a cycle.

### 5.9 Funding run

A funding run is one confirmed assignment of a paycheck.

Fields: `incomeTransactionId`, `date`, `createdAt`, `undoneAt?`.

The funding run owns its `fund` events. Undo of the run sets `undoneAt` on the run. Then its events do not count.
An income transaction has a maximum of one funding run that is not undone.

### 5.10 Valuation

Fields: `accountId`, `date`, `balance`, `note?`, `documentId?`.

Use valuations for:
- `investment` and `property` accounts.
- Lender checkpoints for `mortgage` and `loan` accounts.

An account has a maximum of one active valuation on each date.

The user enters a valuation, or approves an MCP proposal.
For a mortgage, a valuation replaces the calculated balance from its date.

### 5.11 Import batch and import row

Batch fields: `accountId`, `documentId?`, `proposalId?`, `parser`, `periodStart`, `periodEnd`, `closingBalance?`, `closingDate?`,
`createdAt`, `undoneAt?`.
- A batch has a document (file upload) or a proposal (MCP, §12). It must have one of them, not both.

Row fields: `batchId`, `rowIndex`, `date`, `amount`, `payeeRaw`, `bankId?`, `identity`,
`outcome` (`created | matched | duplicate | ignored`), `transactionId?`.

Identity:
- If the bank gives a transaction ID: `identity` = `bank:<bankId>`.
- If not: `identity` = `fp:<hash(accountId, date, amount, normalizedPayee, n)>`.
  `n` is the position of the row among rows with the same date, amount and payee **in the same file**.
- There is a unique index on (`accountId`, `identity`) for active rows.
  An active row has the outcome `created`, `matched` or `ignored`, and its batch is not undone.
  A `duplicate` row is never active, because it has the same identity as an earlier row.
  An `ignored` row is active. Thus, an ignored row does not come back when the user imports the file again.

### 5.12 Document

A document is an original uploaded file.

Fields: `filename`, `hash` (unique), `mimeType`, `storagePath`, `uploadedAt`.

Keep documents permanently. Use only a soft delete.

### 5.13 Checkpoint and month close

Checkpoint fields: `accountId`, `date`, `statementBalance`, `createdAt`, `unlockedAt?`.
- The app creates a checkpoint only if the calculated balance on `date` is equal to `statementBalance`.
- When the app creates a checkpoint, all transactions of the account on or before `date` become `reconciled`.

Month close fields: `month` (`YYYY-MM`), `closedAt`, `reopenedAt?`, `reopenReason?`, `summaryJson`.

### 5.14 Proposal

A proposal is a change that MCP suggests (§12).

Fields: `kind`, `payloadJson`, `source`, `status` (`pending | approved | rejected`), `resultRef?`, `createdAt`, `decidedAt?`.

When the user approves a proposal, the app makes the change with the same code that the UI uses.

### 5.15 Inbox dismissal

Fields: `itemKey`, `reason`, `dismissedAt`.

The app calculates most Inbox items from other records. It does not store them.
`itemKey` is a stable key for one item: the item kind and the IDs of its records.
A dismissed item does not show again. If the user removes the dismissal, the item shows again.

### 5.16 Forecast snapshot

Fields: `month` (`YYYY-MM`, unique), `asOf`, `predictedTotal`, `createdAt`.

It stores the forecast of the on-budget total for the last day of the month (§8).

### 5.17 Audit log

`audit_log`: §11.

### 5.18 Settings

| Key | Default | Use |
|---|---|---|
| `currency` | Set at setup | Book currency (§4) |
| `bufferAmount` | 0 | Lowest safe balance for "safe to spend" |
| `emergencyFundMonths` | 3 | Hygiene check |
| `staleImportDays` | 10 | Hygiene check |
| `promoteAfter` | 3 | Confirmations before a rule suggestion |
| `recurringGraceDays` | 3 | Date window for recurring links |

## 6. Calculated values

- **On-budget total** = the sum of the balances of all on-budget accounts. Card balances are negative.
- **Bills reserved** = the sum of the unlinked `bill` occurrences from today until the next `fundsBuckets` income occurrence.
  The next income occurrence is not included. If there is no income plan, use the next 30 days.
- **Unassigned** = on-budget total − the sum of the positive bucket balances − bills reserved.
- **Credit cards do not need a special bucket.** The on-budget total includes the card balances.
  A card purchase decreases its bucket and the total by the same amount. Thus, Unassigned does not change.
  A card payment is a transfer between two on-budget accounts. It does not change Unassigned.
- **Safe to spend (today)** = the lowest projected on-budget total until the next paycheck (§8) − `bufferAmount`.
  Show the balance of each spending bucket with it.

## 7. Workflows

### 7.0 First-run setup

When the database has no settings, the app shows the setup screen. The user:
1. Selects the book currency.
2. Selects the default category set, or starts with no categories.

The app does not create accounts at setup.

### 7.1 Accounts

The user can create, edit and archive accounts.
- To archive an account with a balance that is not zero, the user must confirm.
- The user can change the kind only to a kind of the same class.

### 7.2 Import (CSV)

1. The user uploads a file. The app stores it as a Document.
   If a document with the same hash exists, show its batch. Do not import again.
2. The app selects the parser for the account:
   - **OFX/QFX parser.** It uses the bank transaction ID (`FITID`) as `bankId`. It reads the closing balance (`LEDGERBAL`).
   - **CSV parser with a column map.** The column map gives the columns for date, description, amount
     (or debit and credit), balance and bank ID, plus the date order and the sign convention.
     The app saves the map on the account.
   - **Bank presets** are column maps stored as data files in `presets/`. Example: a TD credit card preset.
     A contributor adds a bank with a preset file and a synthetic test file. A preset does not contain code.
3. The app calculates the `identity` of each row. If an active row has the same identity, the outcome is `duplicate`.
4. If not, the app looks for a match: a transaction in the same account, with the same amount,
   a date within ±3 days, and no import row.
   - One candidate: the outcome is `matched`. The app links the row. The batch summary shows it.
   - More than one candidate: the row goes to the Inbox.
5. If there is no match, the outcome is `created`. The app creates a transaction with one line.
   §7.3 gives the merchant and category.
6. If the file has a running balance, the app stores `closingBalance` and `closingDate`.
   The app then offers a checkpoint (§7.5).
7. The app shows the batch summary. Example: "42 created · 8 matched · 3 duplicates · 2 need review".
8. **Undo batch:**
   - The app removes the transactions that the batch created, if they are not reconciled and not edited after import.
   - The app removes the links of matched rows.
   - The app shows the rows that it cannot undo.

If the user imports the same file again, or a file with overlapping dates, the app must not create duplicate transactions.

### 7.3 Categorization

**Normalized payee.** One pure function makes it. Table tests cover it. The function:
1. Changes the text to uppercase.
2. Removes processor prefixes: `SQ *`, `TST*`, `PAYPAL *`, `SP ` and similar.
3. Removes store numbers, terminal numbers, card digits and reference numbers.
4. Removes the city and province at the end.
5. Replaces many spaces with one space.

**Suggestion order.** The first result that the app finds is the suggestion. Each suggestion shows its reason.
1. Rules, in order of priority. Rules for one account come before global rules.
2. Payee history: the last 10 categorized transactions with the same normalized payee.
   If 80% or more have the same category, suggest it.
3. The default category of the merchant.
4. No result: the line is uncategorized. It goes to the Inbox.

On import, the app applies steps 1–3. The transaction stays `open`. It shows in "Review recent".
Only rows without a suggestion go to the Inbox.

**Promote to rule.** The user confirms the same normalized payee with the same merchant and category
`promoteAfter` times. If no rule exists for it, the Inbox suggests a rule.
If the user accepts, the app creates an `exact` rule with `origin` = `promoted`.

**Transfer detection.** An imported row can have an opposite amount to an unlinked row in a different on-budget account,
within ±3 days. Then the Inbox suggests a transfer pair. The user accepts with one click.

### 7.4 Recurring

- **Link.** A transaction can match an unlinked occurrence. A match must have:
  the plan's account, a date within ±`recurringGraceDays`, the plan's merchant (if set),
  and an amount within the tolerance.
  - One candidate: the app links it automatically.
  - More than one candidate: the Inbox shows it.
- **Changed amount.** If a linked amount is outside the tolerance, the Inbox shows it.
  Example: "Netflix $16.99 → $19.99. Update the plan?"
- **Missed.** If an occurrence is older than the grace period, has no link and is not skipped, the Inbox shows it.
- **Detection.** The Inbox suggests a new plan when a merchant has:
  - 3 or more transactions.
  - Gaps that agree with weekly, biweekly, monthly or yearly, within ±3 days.
  - Amounts within 10% of their median.
- Plans do not create transactions.

### 7.5 Reconcile and close

**Checkpoint.**
1. The user enters the statement date and balance. Or, the import supplies them.
2. If the balances are not equal, the app shows the difference.
   It also shows possible causes: uncleared transactions, possible duplicates, date ranges with no imports.
3. The user cannot force a checkpoint when the balances are not equal.

**Unlock.** The user can unlock a checkpoint to edit reconciled transactions. The audit log records the unlock.

**Month close.** The user can close a month only when:
- Each on-budget account has a checkpoint on or after the last day of the month.
- The Inbox has no items with a date in that month.

When the month closes, the app stores `summaryJson` (the month story, §9).
The user can open the month again. The user must give a reason.

### 7.6 Paycheck funding

1. A transaction links to a `fundsBuckets` income occurrence. The Inbox shows "Fund this paycheck".
2. The app calculates a proposal. It uses bucket priority order. It stops when the paycheck amount or Unassigned is used,
   whichever is smaller.
   - Spending: `refillTo − balance` at the first paycheck of the month. At other paychecks: 0.
   - Sinking: `(amount − balance) / the number of remaining fundsBuckets income occurrences before dueDate`.
   - Goal: `(target − balance) / the number of remaining occurrences before targetDate`. If there is no date, use the fixed amount.
3. The user confirms with one click, or edits the amounts. The app creates a funding run.
   Round each amount up to the next cent.
4. The user can also fund a bucket from Unassigned at any time. This is a manual fund event.

### 7.7 Overspending

If a bucket balance is less than zero, the Inbox shows it.
Example: "Groceries is −$42. Cover from…".
The user can move money with one click, from Unassigned or from a different bucket.

Expense lines in categories without a bucket decrease Unassigned directly.

### 7.8 Goal feasibility

For each goal and sinking bucket, the app calculates the amount for each paycheck (§7.6).
The Plan screen compares the total with the paycheck surplus.

Paycheck surplus = expected paycheck − bills for each paycheck − spending refills for each paycheck.

If the surplus is too small, the app shows the shortfall. It also shows two fixes:
- A later date that is possible.
- The amount to decrease in a different bucket.

## 8. Forecast

The forecast is daily, for 90 days. It shows each on-budget account and the total. It has two series.

**Known series:**
- Today's balances.
- Unlinked recurring occurrences: income, bills and transfers. Apply the business-day shift.
- Card payments.

**Estimated series:** the known series + variable spending.
- Spending buckets: `refillTo`, divided equally across the days of each month.
  Use the account that usually pays for the bucket's categories.
- Expense categories without a bucket: the median of the last 3 closed months, divided equally across the days.
  Do not include transactions that link to a plan.
  Do not include lines larger than 3 × the median line of that category.

**Card payments:**
- `full`: the balance on the statement day. The payment occurs on the due day, from the usual payment account of the card.
- `fixed`: `fixedPayment`.
- `manual`: no payment. The app shows a warning.

**Output:**
- The lowest point and its date.
- Safe to spend (§6).
- Each account that goes below zero or below the buffer.

**Accuracy:** The first forecast request with an `asOf` in a new month stores the forecast for the last day of that month.
The backend has no scheduler for this (§4).
At month close, Insights shows the forecast value and the actual value.

After 90 days, show only the monthly net values from the Plan screen. Do not show daily values.

## 9. Insights

- **Month story.** The app makes it at month close. It is also available for the current month. It shows:
  - Income, spending and savings rate.
  - The 3 largest increases and the 3 largest decreases by category, compared with the 3-month median.
  - New merchants.
  - Changes to recurring payments.
  - Bucket results.
  - Plan compared with actual.
- Spending by category, group, merchant and tag, for a period that the user selects.
- A 12-month trend for each category.
- **Net worth.** Assets − liabilities at the end of each month. Show a chart for 24 months.
- **Mortgage.** Balance, rate, schedule and payoff date. Also, the effect of an extra payment amount.

## 10. Hygiene checks

One panel shows all checks. Each check is deterministic. Each check shows its numbers and a link to the fix.

| Check | The check passes when |
|---|---|
| Emergency fund | Essential goal buckets (or savings accounts, if there are no essential goal buckets) ≥ `emergencyFundMonths` × (monthly bills + monthly essential refills) |
| Cards paid in full | The last statement balance of each `full` card was paid by its due day |
| Imports are current | Each on-budget account has an import in the last `staleImportDays` days |
| Months are closed | The previous month is closed |
| Inbox | No items are older than 7 days |
| Sinking funds | Each yearly `bill` plan has a sinking bucket for its category |
| Savings rate | The savings rate of the last 3 closed months is 0% or more. Show the percentage. |
| Recurring | There are no changed or missed occurrences |
| Overspent | No bucket has a negative balance |

## 11. Audit and undo

`audit_log` fields: `entity`, `entityId`, `action`, `before`, `after`, `source` (`ui | import | mcp`), `at`.

Undo is available for:
- Import batch.
- Funding run.
- Bucket move.
- Rule "Apply to existing".
- Checkpoint (unlock).
- Month close (open again).

To correct other records, the user edits them. The audit log records each edit.

## 12. MCP

- Transport: streamable HTTP. The API serves it. The proxy in front of the app protects it (§13).
- **Read tools:** accounts, balances, transaction search, categories, merchants, buckets, plan, forecast, insights, inbox.
- **Write tools create proposals only:**
  - `propose_transactions`: for example, rows from a PDF statement, with the closing balance.
  - `propose_categorization`
  - `propose_merchant`
  - `propose_rule`
  - `propose_valuation`
- Proposals show in the Inbox. Approval uses the same code as the UI.
- Proposed transactions go through import matching and duplicate checks (§7.2), the same as a CSV.
- REST and MCP use the same service functions. MCP has no business logic of its own.

## 13. Platform

- **Stack:** Bun, Hono with `@hono/zod-openapi`, Zod, Drizzle with `bun:sqlite`, `Temporal.PlainDate`.
  React, Vite, TanStack Router and Query, shadcn/ui, Tailwind. Tests use `bun test`.
  Decision 0004 gives the package boundary, list queries and the test policy.
- **One process:** Hono serves the API, MCP and the built web app on one port.
- **Hosting:** One Docker image. It runs on any Docker host. `docs/self-hosting.md` tells how to install it.
  - Use one instance only.
  - Use **stop-first** deploys. Two containers must not use the same database.
  - The owner's instance: Coolify on a Fedora NUC, Cloudflare Tunnel, Cloudflare Access, Cloudflare MCP portal.
    This is an example in the docs. The code does not require Cloudflare.
- **Access control is outside the app (decision 0006).** Num has no login, no users and no tokens.
  - The operator must run Num on a private network, with no public port.
  - The operator must put an authenticating proxy in front of all remote access.
    The owner's instance: Cloudflare Tunnel with Cloudflare Access for the web app,
    and the Cloudflare MCP portal with Cloudflare Access for MCP.
  - `docs/self-hosting.md` must tell this in a warning at the start.
  - The server listens on `HOST` (default `127.0.0.1`) and `PORT` (default `3000`).
    The Docker image sets `HOST=0.0.0.0`.
- **Storage:** One volume. It contains `num.sqlite` (WAL mode) and `uploads/`.
- **Migrations:** Drizzle. At startup, first copy the database to `backups/pre-migrate-<timestamp>.sqlite` on the volume.
  Then apply the migrations.
- **Backups:**
  - Optional Litestream replication of SQLite to any S3-compatible storage. Environment variables enable it.
  - Optional nightly copy of `uploads/` to the same storage.
  - The Settings screen has "Download backup": one archive with the database and `uploads/`.
  - `docs/self-hosting.md` contains the restore procedure.

## 15. Open source

- The license is in `LICENSE` (decision record 0003).
- The repository must not contain personal data. Test fixtures are synthetic.
  Do not copy real statements, names, merchants or balances into the repository.
- The default category set is generic. It must be correct for any country.
- Contributions follow `CONTRIBUTING.md`. Bank presets are the easiest contribution (§7.2).

## 14. Screens

There are 8 screens.

| Screen | Contents |
|---|---|
| Inbox | All items that need a decision. The user clears it to zero. |
| Transactions | Search and filter, detail and edit, lines, tags, transfers |
| Plan | Monthly: income → bills → bucket funding → Unassigned. Goal feasibility. Forecast chart. Safe to spend. |
| Buckets | Balances, funding history, moves, settings |
| Insights | Month story, categories, merchants, tags, net worth, mortgage, hygiene panel |
| Accounts | List with balances, import, checkpoints, valuations, mortgage terms |
| Recurring | Plans, occurrences, links, skips |
| Settings | Categories, merchants and rules, tags, preferences, backup download |

The first-run setup screen (§7.0) is not one of the 8 screens. It shows only one time.
