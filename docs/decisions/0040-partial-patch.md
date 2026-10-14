# 0040 — Partial PATCH

Status: accepted (owner, 2026-10-14)

## Context

1. Most `PATCH` routes needed the full record: the name, the kind and the other required fields, also for a change of
   one field. Some fields were optional ("leave it out to keep it"), others were not. Each route had its own rule.
2. A client that changes one field had to read the record first and send it back. Two clients that change different
   fields of the same record could undo the change of the other client.
3. Some cross-field rules ran only on the body. A body that left out the card fields or the interest rate had them
   cleared or kept by special code in each service.
4. `POST /api/accounts/{id}/opening` set the opening date and the opening balance from a suggestion. It was a second
   write route for two fields of the account.

## Decision

1. Each `PATCH` body has only the fields that change: accounts, buckets, categories, category groups, merchants,
   recurring plans, tags, transactions and `settings/ai`. The body schema is the write schema with all fields optional.
   A field that the body leaves out keeps its stored value. `null` clears a field that can be empty. A list field
   (`lines` of a transaction, `categoryIds` of a bucket) replaces the stored list. `settings/currency` is not part of
   this decision.
2. The service merges the patch into the stored record and checks the result with the full write schema. Thus the
   cross-field rules use the stored values too:
   - a credit card with the policy `fixed` needs `fixedPayment`, and other policies have no `fixedPayment`;
   - mortgage terms need the kind `mortgage` and an opening date;
   - an interest rate needs a kind that has one;
   - the kind fields of a bucket, the rules of a recurring plan, "essential" only for an expense category;
   - the lines of a transaction add up to its amount.
   A failed check answers 400 `invalid_body` with the field. The service does not clear a field silently. Example: a
   change of the kind from savings to chequing must also send `interestRateMilliPct: null`.
3. Remove `POST /api/accounts/{id}/opening`. "Set the opening balance" sends
   `PATCH /api/accounts/{id}` with `openingBalance` and `openingDate`. The guard of the old route moves into the
   update: on a mortgage with terms, a patch that changes the opening date or the opening balance must include the
   terms (`opening_date_fixed` otherwise).
4. The web forms send the full form. A full body is a valid patch, and the forms already check the full values. The
   opening-balance buttons send only the two fields. The Account form sends `mortgageTerms: null` when the kind is
   not a mortgage.

## Consequences

- Spec changes: §4 (a "Changes" convention), §5.1 (the opening-balance suggestion is a patch of two fields).
- The MCP descriptions of the `PATCH` tools say "Send only the fields that change". The tool
  `post_accounts_id_opening` goes away with its route.
- The service functions of the old "leave it out to keep it" rule (`keepOmitted` for plans and accounts, the card and
  rate special cases) are removed. `keepOmitted` stays only for the inbox answers that call the transaction update
  directly.
- Logic tests: a patch keeps the other fields; the card fields, the interest rate, the mortgage terms, the plan rules
  and the bucket kind fields are checked on the merged record; a transaction patch keeps its lines; the opening
  guard.
