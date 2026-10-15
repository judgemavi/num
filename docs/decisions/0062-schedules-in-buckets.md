# 0062 — Schedules are buckets: commitments and income

Status: approved (owner, 2026-10-15)

## Context

1. A bill or a loan payment is a commitment: money that the user must keep for a known payment. The app keeps that
   money in two other places: bills reserved (§6) and sinking buckets for yearly bills (§10). Each calculation that
   needs the commitments (feasibility, the emergency figure) must find them again, and some miss them (the mortgage).
2. The owner wants one place: a commitment is a bucket with a schedule. The Recurring screen is removed.
3. Income needs no money in a bucket, because the fill pays from Unassigned (decision 0059). But the forecast, safe to
   spend, feasibility and the missed-payment item need its schedule.
4. Decision 0060 item 4 counts the categories of the bill plans. A bill plan does not need a category, and a mortgage
   is a transfer. Thus the emergency figure misses most commitments. The payments that are linked to a schedule do
   not need a category.

## Decision

1. **Two new bucket kinds (amends §5.8).**
   - `commitment`: a bucket with a schedule. It holds money for the payments of the schedule.
   - `income`: a schedule with no balance. It is not funded and holds no money. Income goes to Unassigned.
2. **Schedule fields.** A commitment and an income have the schedule fields of §5.7: `accountId`, `expectedAmount`,
   `amountMode`, `tolerance`, `merchantId?`, `categoryId?`, schedule `startDate`, `freq`, `interval`, `monthDay?`,
   `businessDayShift`, `endDate?`. A commitment has `transferAccountId?`: with it, the payment is a transfer
   (example: the mortgage). An income has `payday` (boolean; replaces `fundsBuckets`, §6).
   The occurrences, links, skips, tolerance, "Amount changed" and missed payments of §5.7 and §7.4 do not change.
   The user sees one record. The code can keep the schedule in its own table, with one bucket for each schedule.
3. **Only two kinds of schedule.** A schedule is a commitment or an income. A transfer that is not a commitment has no
   schedule (example: a monthly move to savings).
4. **Commitment balance.** Balance = the bucket events + the payments linked to its occurrences, on or after the
   bucket `startDate`. A payment counts with the full amount of the transaction (all lines; a loan payment includes the
   interest line). A transaction linked to a commitment does not count in a category bucket.
5. **Commitment monthly amount (amends decision 0059 item 1).**
   - Occurrences monthly or more often: the sum of the occurrences due in the month, on or after `startDate`
     (a `variable` amount uses the safe amount of §5.7) − balance, minimum 0.
   - Occurrences less often than monthly (example: yearly): `(next occurrence amount − balance) / the number of
     months from this month to the month of the next occurrence`, minimum 0. If it is due in this month: the whole
     shortfall.
   A commitment is `essential` by default. The user can change it (example: a streaming service).
6. **Income.** An income row shows the amount expected in the month and the amount received (linked). The window of
   safe to spend ends at the next occurrence of an income with `payday` (§6).
7. **Bills reserved is removed (amends §6).** Unassigned = on-budget total − the sum of the positive bucket balances.
8. **Priority.** New commitments come before all other buckets. The user can change the order. When two buckets have
   the same priority, a commitment comes first, then the order of the id. The fill, the month plan and the bucket list
   use this same order.
9. **Emergency figure (amends decision 0060 item 4).** Monthly essential spending = the outflow of one month of the
   transactions linked to active essential commitments, and of the expense lines in the categories of the active
   essential buckets. Count each transaction one time. Median and fallback as decision 0060; the planned figure is the
   monthly amount of the essential commitments (yearly amount / 12) + the `refillTo` of the essential spending buckets.
10. **Feasibility (amends decision 0059 item 11).** Monthly surplus = the income (yearly amount / 12) − the monthly
    amount of each other bucket. A commitment uses its yearly amount / 12 here, so the result does not change between
    months.
11. **Sinking.** A sinking bucket is for a cost with no schedule (example: a car repair). The hygiene check "Sinking
    funds" is removed (§10).
12. **Detection (amends §7.4, decisions 0054, 0056).** Detected suggestions offer "Add as commitment" or
    "Add as income".
13. **Screens (amends §14 and decision 0021).** The Recurring screen is removed. There are 6 screens. Buckets has the
    groups Income, Commitments, Spending and Savings (sinking, goal, emergency). The side column has Upcoming
    (decision 0055) and Detected. One editor for each kind; the commitment and income editors have the schedule fields.
14. **Migration.** The migration does not copy the recurring plans. It removes the recurring plans, their links and
    their skips. The owner adds the commitments and the incomes again (no users before cutover).
15. **Home "This month" (amends §14).** "Commitments" is the monthly amount of the commitment buckets (§7.6), not the
    payments that are due in the month. "Bucket funding" is the monthly amount of the other buckets. Thus a yearly bill
    gives the same figure each month.

## Consequences

- Spec §5.7, §5.8, §6, §7.4, §7.6, §7.7, §7.8, §8, §10 and §14 change. Decisions 0021, 0055, 0056 and 0059–0060 are
  amended.
- The routes and the web code of the Recurring screen move to Buckets. No redirects (no users before cutover).
- After the migration, the owner adds the commitments and the incomes, and archives or keeps the sinking buckets for
  yearly bills.
- Logic tests: the monthly amount of a weekly, monthly and yearly commitment; occurrences before `startDate`; the
  balance with linked payments (full amount, loan payment); a linked transaction does not count in a category bucket;
  Unassigned without bills reserved; the emergency figure (linked payments, count one time, fallback); feasibility
  with yearly / 12; the safe-to-spend window with `payday`; the priority order with ties.
