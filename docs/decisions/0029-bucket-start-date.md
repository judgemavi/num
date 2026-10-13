# 0029 — Bucket start date

Status: approved (owner, 2026-10-13)

## Context

1. Spec §5.8: bucket balance = funds + moves in − moves out − releases + the sum of the lines in the bucket's
   categories. The sum includes all lines. It has no start date.
2. The user imports history first and makes buckets after. Then all past lines in the categories go into the new
   bucket. No fund event covers them, because the bucket did not exist.
3. Example: a spending bucket with `refillTo` 250 is made in October. Its category has 7 months of lines
   (−1,415.91 in total) and no line in October. The bucket shows −1,415.91 and "Overspent". The user expects 250 left
   after funding.
4. The first paycheck funding then proposes `refillTo − balance` = 1,665.91. This moves 1,415.91 from Unassigned to
   pay for spending that happened before the bucket existed. Unassigned becomes wrong.

## Decision

1. A bucket has a `startDate` (a calendar date).
2. Bucket balance counts only the lines of transactions with a date on or after `startDate`.
3. Bucket events (`fund`, `move`, `release`) count on all dates. A paycheck can have a date before `startDate`
   and fund the bucket.
4. When the user makes a bucket, `startDate` is `asOf` from the request. The bucket form shows "Start date".
   The user can change it. The change is audited.
5. When the user adds a category to a bucket, the lines of that category count from the bucket's `startDate`.
   A category does not have its own start date.
6. Lines before `startDate` in a bucket's categories do not go into a bucket. They are in the account balances,
   thus they are in the on-budget total and in Unassigned already (§6).

## Consequences

- Spec §5.8 changes: the `startDate` field and the balance rule.
- A migration adds `buckets.start_date`. For each bucket, the value is the date part of the bucket's `create` entry
  in the audit log. If there is no entry, the value is the date of the bucket's first event. If there is no event,
  the value is the date of the first line in its categories.
- The month story, the forecast and goal feasibility use the same balance rule (§7.6, §7.8, §8, §9).
- API, MCP and shared schemas: the bucket write and read have `startDate`.
- Logic tests: the balance excludes lines before `startDate`, includes lines on `startDate`, and includes events
  before `startDate`.
