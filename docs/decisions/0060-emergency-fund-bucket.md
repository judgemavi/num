# 0060 — The emergency fund is a bucket

Status: approved (owner, 2026-10-14)

## Context

1. Spec §10 checks the emergency fund against essential goal buckets, or savings accounts if there are none.
   The user does not see one clear amount, and the app does not save for it.
2. The owner wants one emergency fund bucket in each book. The user sets only the number of months. The app
   calculates the target from the essential spending and fills the bucket automatically (decision 0059).

## Decision

1. **New kind (amends §5.8).** Bucket `kind` gets the value `emergency`. A book has exactly one emergency bucket.
   It has no categories. The user spends from it with a move or a release.
2. **Settings of the kind.**
   - `months`: the number of months of essential spending to keep. Default 3.
   - `fillMonths`: the number of months to fill the bucket from 0. Default 12.
   `emergencyFundMonths` is removed from the settings (§5.18).
3. **Default bucket (amends §7.0).** The setup makes the emergency bucket: name "Emergency fund", essential, with a
   colour and an icon from the fixed set (decision 0009). Its `startDate` is the setup date. The user can change the
   name, the colour, the icon, the priority and the settings. The user cannot make a second one.
   The fill (decision 0059 item 4) also makes the bucket, with `startDate` = `asOf`, when a set-up book has none.
   Thus the migration does not need a date, and the server does not need "today".
4. **Monthly essential spending.** The sum of the expense lines of one month in:
   - the categories of the essential buckets, and
   - the categories of the active `bill` plans.
   The figure is the median of the last 6 complete months before the date of the calculation.
   If fewer than 3 complete months have lines, use the planned figure: the monthly amount of the active `bill` plans
   plus the `refillTo` of the essential spending buckets.
5. **Target.** Target = `months` × the monthly essential spending. The target changes when the spending changes.
   When the balance is more than the target, the money stays in the bucket and funding stops.
6. **Monthly amount (decision 0059 item 1).** The smaller of `target / fillMonths` and `target − balance`, minimum 0.
   The bucket refills at the same rate after the user takes money out.
7. **Priority.** The new bucket comes after the spending and sinking buckets and before the goal buckets.
   The user can change the order.
8. **Where the money is.** The bucket is a label on on-budget money, as all buckets are. A savings account that keeps
   the money must be on-budget.
9. **Archive.** The usual rule applies: the balance must be 0. An archived emergency bucket has no hygiene check.
   The user can restore it.
10. **Hygiene check (amends §10).** Emergency fund passes when the balance of the emergency bucket is equal to or more
    than its target. The check shows the balance, the target, `months` and the monthly figure.
    When the target is 0 (no bills, no essential refills and no history), the check does not show.
11. **Feasibility (amends §7.8).** The monthly surplus also subtracts the emergency amount of item 6.
12. **Months with lines.** Item 4 counts only the complete months that have essential expense lines. The median is
    over those months.

## Consequences

- Spec §5.8, §5.18, §7.0, §7.6, §7.8, §10 and §14 (Buckets settings) change.
- The bucket editor shows `months` and `fillMonths` for this kind and no category picker.
- The bucket and the check show the calculation. The API returns the integers. The browser formats them.
- Logic tests: the median of 6 months; the fallback with fewer than 3 months; the target; the monthly amount and the cap
  at the shortfall; refill after a release; no second emergency bucket; the check with an archived bucket and with target 0; the fill makes a missing bucket.
