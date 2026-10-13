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

Words are the words of the normalized payee (§7.3). A **learned payee** is a normalized payee with confirmations.

1. **Noise words (counted from the user's data, no lists).** A word is noise when it is never the first word of a
   normalized payee and it comes after 5 or more different first words. Example: TORONTO, ON. A word that follows
   only one merchant (EATS after UBER) is not noise. The normalization rules of §7.3 stay for the first imports.
2. **Anchor.** A learned payee is a candidate only when its first word is equal to the first word of the new payee,
   or one is a prefix of the other with 4 or more letters (a cut word).
3. **Contained.** Every word of the learned payee that is not noise is in the new payee. The last word may be a prefix
   (4 or more letters) of a word in the new payee, or the reverse (a cut word).
4. **Longest match.** From the contained candidates, use the one with the most words that are not noise.
   If two have the same count and different learned labels, there is no match.
5. **Result.**
   - **Same payee:** contained, and the new payee has no other words that are not noise. The new payee uses the
     learned signals of that payee (learned payee + amount, learned payee), with the normal formula and levels.
     It can be automatic. Reason: "You chose this N times for this payee".
   - **Similar payee:** contained, and the new payee has other words that are not noise (PRESTO FARE after PRESTO,
     UBER EATS after UBER). Confidence = learned confidence × 0.9. It is never automatic, whatever the setting.
     Reason: "Same as <learned payee>".
   - Otherwise there is no match from this signal.
6. The trigram signal is removed. Merchant default (0.60) does not change.
7. When the user confirms the new payee, it becomes a learned payee itself (exact match from then on).

## Consequences

- Spec §7.3 (signals table, reasons) changes. The `similar` reason stays as a code.
- Logic tests: COSTCO WHOLESALE W535 TORONTO, ON → same payee as COSTCO WHOLESALE (after TORONTO is noise);
  PRESTO FARE → similar to PRESTO, never automatic; SHELL GAS never matches COSTCO GAS; UBER EATS goes to a learned
  UBER EATS before UBER; a cut first word (NOFRILL) matches NOFRILLS; two equal candidates with different labels give
  no match; TORONTO HYDRO keeps TORONTO as its anchor; a word after fewer than 5 first words is not noise.
- Performance: an index by first word; the noise counts are built from the distinct normalized payees.
