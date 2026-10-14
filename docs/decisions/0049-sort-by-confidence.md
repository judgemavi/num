# 0049 — Sort the Needs review page by confidence

Status: approved (owner, 2026-10-14)

## Context

The Needs review page (decisions 0047, 0048) sorts by date, payee or amount. The user wants to see the rows by
confidence: for example, all Sure rows together, or the rows that the app is not sure about first.

## Decision

1. The Needs review list has one more sort column: `confidence`. Only `/transactions/review` and its API read have it.
   `/transactions` and the account page do not.
2. The Confidence column header is a sort button, as Date, Payee and Amount are.
3. The order from low to high (`asc`): no suggestion, Question, Maybe, Likely, Sure. In a level, a lower confidence
   score comes first. `desc` is the opposite order. Equal rows sort by date (newest first), then by id.
   A Sure row uses the score of its automatic label. A suggestion uses its score. A question and a row with no
   suggestion have no score.
4. The first click sorts `asc`, as for the other columns. The default sort of the page stays date, newest first.
5. The sort runs in SQL with the rank of each row from the review read, so the pages and the filters do not change.

## Consequences

- Spec §7.3 and `docs/design.md` §6a change.
- The review list gets its own query schema: the transaction list schema with the extra sort column (decision 0004).
- Logic tests: the review read sorts by confidence in both directions over two pages, with the level first and the
  score second.
