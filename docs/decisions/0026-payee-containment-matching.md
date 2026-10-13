# 0026 — Match a payee by containment, not by trigram similarity

Status: approved (owner, 2026-10-12)

## Context

The same merchant comes with extra words from other banks or statement formats:
"COSTCO WHOLESALE W535" and "COSTCO WHOLESALE W535 TORONTO, ON"; "PRESTO" and "PRESTO FARE TORONTO, ON".
The similar-payee signal (character-trigram cosine ≥ 0.80, §7.3) scores these 0.59–0.73, so there is no suggestion.
Research over record linkage (Fellegi–Sunter, Splink), string metrics (Jaro–Winkler, TF-IDF, Monge–Elkan, BM25,
MinHash) and search engines found that symmetric metrics always lose score for added words. The problem is
containment: the learned payee is at the start of the new text, and the rest is noise or a sub-brand.
Trained models (dedupe, libpostal) are not allowed (spec §2, deterministic).

## Decision

Words are the words of the normalized payee (§7.3). A **learned payee** is a normalized payee with confirmations
(a category, a merchant or a transfer).

1. **Anchor.** A learned payee is a candidate only when its first word is equal to the first word of the new payee.
2. **Contained.** The words of the learned payee are in the new payee, in the same order (a repeated word must be
   repeated). The last word of the new payee may be the start (4 or more letters) of a word of the learned payee,
   because banks cut long text.
3. **Longest match.** From the contained candidates, use the one with the most words. If two have the same count and
   different learned labels, there is no match.
4. **Result: similar payee.** Confidence = that payee's learned confidence × 0.9. It is never automatic, whatever the
   setting. The suggestion is the learned label (category and merchant, or the learned transfer).
   Reason: "Same as <learned payee>".
5. There is no automatic match by containment. Extra words can be a city (TORONTO) or a different business of the same
   brand (COSTCO GAS after COSTCO). The app cannot tell them apart without location data, so the user decides once:
   the confirmation makes the new payee a learned payee, and later imports match it exactly.
6. The trigram signal is removed. Merchant default (0.60) does not change.

Review (2026-10-12): the first version had learned noise words and a "same payee" result that could be automatic.
A probe showed wrong automatic labels (COSTCO GAS as COSTCO, APPLEBEES as APPLE) and a conflict with payees that start
with a city (TORONTO HYDRO). They are removed.

## Consequences

- Spec §7.3 (signals table, reasons) changes. The `similar` reason stays as a code.
- Logic tests: COSTCO WHOLESALE W535 TORONTO → similar to COSTCO WHOLESALE (Likely, not automatic); PRESTO FARE →
  similar to PRESTO; SHELL GAS never matches COSTCO GAS; COSTCO GAS never matches a learned COSTCO GAS when the new
  payee is COSTCO; UBER EATS goes to a learned UBER EATS before UBER; COSTCO WHOLES (cut) → similar to COSTCO WHOLESALE;
  APPLEBEES is never matched by a learned APPLE; PIZZA HUT is not contained in PIZZA PIZZA; two equal candidates with
  different labels give no match; a learned transfer payee gives a transfer suggestion; the cap holds with eager
  matching and merchant default.
- Performance: an index by first word.
