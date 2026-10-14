# 0036 — Learn the amount band of each payee label

Status: approved (owner, 2026-10-14)

## Context

The payee + amount signal (§7.3) uses a fixed band: the same amount ±1%. This band is the same for all payees and
all labels. Some amounts change each time (pay, utilities, fuel). Some amounts tell two labels of one payee apart
(a 9.99 subscription and other purchases from the same store). A fixed 1% does not learn either case.

The examination of the code found two more problems:

1. **One answer is counted two times.** The payee + amount rows are a part of the payee rows. The app adds the two
   signals for the same candidate as 1 − Π(1 − cᵢ). One answer gives 1 − (1 − 0.85)(1 − 0.81) = 0.97. Thus one answer
   makes a label automatic, also with the Careful setting (0.95). The spec example "payee + amount with 1 answer =
   0.85" is not true in the app.
2. **Direction is not in the key.** A payment to a payee and money from the same payee teach each other. The
   payee-only signal does not look at the amount.

Recurring items (§7.4) also learn a tolerance. This decision does not replace them. A recurring item needs a schedule.
The amount band is for payees without a schedule, and for payees with more than one label.

## Decision

A **learned label** is one candidate (category + merchant) for one key. The key is the normalized payee and the
**direction** of the amount (money out, or money in; zero is money in).

1. **Direction.** The payee + amount, payee, similar and family signals use the key with direction. Learned transfers
   do not change (a transfer to and from one account has the same label).
2. **Band.** For each learned label, take the newest 6 confirmed amounts.
   - 1 amount: the band is that amount ±1%.
   - 2 or more amounts: the band is from the lowest amount − 1% to the highest amount + 1%.
   The newest 6 amounts keep the band current after a price change.
3. **Fit.** A confirmed row supports the payee + amount signal only when the band of its label contains the new
   amount. Agreement and certainty use those rows, with the learned formula. This replaces the ±1% filter.
4. **Width factor.** A wide band is weak evidence. width = (highest − lowest) / highest, from the amounts of the band
   (absolute values). factor = 1 − 0.05 × min(1, width / 0.5). The signal is the learned formula × factor.
   A band with one amount has factor 1. A very wide band has factor 0.95, the same as the payee signal.
   Thus the payee + amount signal is never lower than the payee signal for the same rows.
5. **No double count.** The payee + amount signal and the payee signal for the same candidate do not combine.
   The candidate takes the higher of the two. Signals from other sources (recurring, similar, family) still combine
   as 1 − Π(1 − cᵢ).
6. **Integer compare.** The level compares `confidenceMilli` (0–1000) with the threshold in thousandths
   (Careful 950, Balanced 850, Eager 750, suggestion 600, Likely 750, lead 200). One answer at the same amount
   (850) is then automatic with Balanced, as the spec examples say.
7. **Reasons.** `learned_amount`: "You chose this N times for this payee and amount". `learned_payee` does not change:
   "You chose this N times for this payee".

Example: Pay from KYNDRYL CANADA PAY. Answers at 5,349.85 and 6,445.71. Band 5,296.35–6,510.17. width = 0.17,
factor = 0.983. A new pay of 5,900.00 is in the band: 1 × 0.91 × 0.983 = 0.89, automatic with Balanced.
A new pay of 7,000.00 is not in the band: payee signal 0.91 × 0.95 = 0.86, automatic with Balanced.

Example: STORE has Subscriptions at 9.99 (4 answers) and Shopping at 12.50–240.00 (5 answers). A new 9.99 is only in
the Subscriptions band: Subscriptions. A new 80.00 is only in the Shopping band: Shopping.

## Consequences

- Spec §7.3 changes: the signals table (band, width factor, direction), the combining rule, the reasons and the
  examples. With one answer: same amount = 0.85 (was 0.97 in the app), other amount = 0.81.
- No schema change and no migration. The band comes from confirmed rows when the app loads the match data.
- Labels that were automatic after one answer with Careful are suggestions after this change. Labels already applied
  do not change.
- Logic tests: band with 1 amount (±1%); band with 2 or more amounts; only the newest 6 amounts make the band;
  width factor at 0, 0.25 and ≥ 0.5; an amount outside all bands uses only the payee signal; two labels of one payee
  with separate bands each win in their band; payee + amount and payee for one candidate give the higher value, not the
  combined value; money in does not learn from money out; learned transfers ignore direction; one answer at the same
  amount is automatic with Balanced (850 ≥ 850) and is a suggestion with Careful.
