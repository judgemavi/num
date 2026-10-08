# 0017 — Confidence matching, no rules

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

Rules matched mostly the bank text. Text alone cannot separate cases like rent and other e-transfers, and rules ask
the user to maintain patterns. The owner wants the app to learn and to show how sure it is, without ML.

## Decision

- Remove rules: table, API, Settings section, editor rule builder, "Apply to existing", transfer rules, rule proposals.
- Matching collects signals with a confidence (spec §7.3): recurring link (0.99), learned payee + amount, learned payee,
  similar payee (character-trigram cosine similarity, no model), merchant default (0.60).
- Learned confidence uses recency-weighted agreement and the number of confirmations. Signals for the same candidate
  combine (1 − Π(1 − c)). The best candidate must lead by 0.2.
- Setting `autoConfidence`: Careful 0.95, Balanced 0.85 (default), Eager 0.75. Above it: automatic. From 0.60: suggestion.
- Linking to a recurring item labels the transaction with the item's category and merchant. A recurring mortgage item
  splits the payment by the schedule.
- The UI shows the confidence and the reasons.

## Consequences

- Migration: drop `rules`; add `transactions.auto_confidence`; keep `auto_reason` codes (`recurring | learned_amount |
  learned_payee | similar | merchant_default`).
- Supersedes the rule parts of decisions 0012, 0014 and 0015.
