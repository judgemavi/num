# 0028 — Remove the merchant default category

Status: approved (owner, 2026-10-13)

## Context

1. A merchant has a `defaultCategoryId`. Matching uses it as a signal with confidence 0.60 (decision 0017).
2. The learned payee signals (decisions 0015, 0017) and the payee containment signals (decision 0026) give the same
   information with more confidence. They learn from the user's confirmations. The user does not set them by hand.
3. The user must keep the default category up to date in Settings → Merchants. The owner categorizes by category,
   not by merchant. The field adds work and gives almost no value.

## Decision

1. The merchant has no default category. The fields are `name` and `archivedAt?`.
2. Matching has no merchant default signal. The reason code `merchant_default` is removed.
   The reason "This merchant's usual category" is removed.
3. The merchant form and the Settings → Merchants list do not show a category.
4. Merchants stay. Recurring detection, recurring links, "New merchants" in the month story and the merchant
   reports use them (§7.4, §9).

## Consequences

- Spec §5.6 and §7.3 change.
- A migration removes `merchants.default_category_id`.
- The same migration undoes each automatic label with the reason `merchant_default` that the user did not review:
  it clears the category, `autoReason`, `autoConfidence` and `autoSourceId`. The transaction is then uncategorized
  and needs review. The migration does not change a label that the user set or accepted.
- API, MCP and shared schemas: the merchant write and read have no `defaultCategoryId`.
- Logic tests: remove the merchant default cases. No new tests.
- Supersedes the `merchant_default` parts of decision 0017.
