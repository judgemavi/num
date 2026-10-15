# 0065 — The emergency fund fills from the pool and gives money back

Status: approved (owner, 2026-10-15)

## Context

1. Decision 0060 item 6 fills the emergency bucket at `target / fillMonths` each month. A book with spare money in
   Unassigned takes a full year (default) to fill a fund that it can fill now.
2. The owner wants the emergency bucket to take as much as it can from Unassigned (the pool). When the pool does not
   is short of real money, the emergency bucket gives money back to the pool. The owner wants a visible warning
   before that can happen.

## Decision

1. **Fill (amends decision 0060 item 6).** The amount owed to the emergency bucket is `target − balance` on `asOf`,
   minimum 0. The fill pays it in the priority order of the bucket, as for other buckets. When the balance is more than
   the target, the money stays in the bucket (decision 0060 item 5 does not change).
2. **`fillMonths` is removed** from the bucket, the editor and the API (amends decision 0060 item 2). The migration
   removes the column. It does not copy data.
3. **Recede.** A new bucket event kind `recede` moves money from the emergency bucket to Unassigned. Only the fill
   writes it. It never makes the balance of the emergency bucket less than 0.
   The fill writes a recede only for a cover: a negative bucket needs a cover and Unassigned does not have enough
   (decision 0059 item 8). The recede gives the missing part, then the cover is written. A recede has no month, as a
   cover has no month. A month undo does not remove it.
   An owed amount that Unassigned cannot pay does not cause a recede. The bucket waits for income, as before.
   A negative emergency bucket is not covered by a recede of itself.
4. **Order of the fill.** Covers (with recedes), then the owed amounts in priority order. The emergency bucket takes
   what is left, up to its owed amount. The buckets after it take the rest.
5. **Feasibility (amends decision 0060 item 11).** The monthly surplus does not subtract an emergency amount.
6. **Hygiene check (amends decision 0060 item 10).** The check shows the balance, the target and `months`. It does not
   show a monthly figure.
7. **History.** A recede shows in the bucket history as money that went back to Unassigned.
8. **Warning: recede this month (Home health card, §14).** A check fails when the emergency bucket has a recede that
   is not undone, dated in the month of `asOf`. It shows the total and, for each covered bucket, its name and amount.
9. **Warning: recede ahead (Home health card, §14).** From the forecast (spec §8) to its horizon (90 days), the projected pool
   on each date `d` after `asOf` is:
   `Unassigned(asOf) + income(asOf, d] − Σ over buckets max(0, outflow_b(asOf, d] − balance_b(asOf)) − other outflow(asOf, d]`.
   - `outflow_b` is the forecast spending of bucket `b`: the schedules of a commitment bucket and the variable
     spending of a spending bucket. The emergency bucket is not in the sum.
   - `other outflow` is forecast spending that has no bucket.
   - The check fails when the projected pool is less than 0 on some date. It shows the first such date and the amount
     that the emergency fund would give: the smaller of the lowest projected pool (as a positive amount) and the
     emergency balance. When the emergency balance is not enough, it also shows the part that is not covered.
   - The amounts are rounded to the step of the book currency.
   - The check does not show when the book has no emergency bucket.

## Consequences

- Decision 0060 items 2, 6, 10 and 11 change. Spec §5.8, §7.6, §7.7, §7.8, §10 and §14 follow this decision.
- Logic tests: the emergency bucket takes all of the free pool up to its target; buckets after it get the rest;
  a recede for a cover; no recede for an owed amount; a recede never makes the balance negative; month undo keeps the
  recede; feasibility without an emergency amount; the recede-this-month check; the projected pool (first negative
  date, amount capped at the emergency balance, the part not covered, outflow inside the bucket balance does not
  count).
