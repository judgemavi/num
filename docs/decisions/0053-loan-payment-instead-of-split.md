# 0053 — Loan payment instead of Split

Status: approved (owner, 2026-10-14)

## Context

1. "What is this?" has Split (decision 0025): many lines, each with a category or an account, a direction on each
   line, "Money in on this line", "$X left" and "Put it on the last line".
2. The owner uses lines only for mortgage and loan payments: interest (a category) and principal (a transfer to the
   loan account). The owner has no other split transactions.
3. A mortgage with terms gives the interest of each payment from the schedule (§5.2, decision 0025). A loan has no
   terms and no schedule.
4. Spec §2 principle 6 says that the UI does not show the word "split". The bulk editor tooltip (decision 0051)
   shows it.

## Decision

1. **"What is this?"**
   - Money out: Spending · Transfer · Loan payment.
   - Money in: Income · Refund · Transfer.
   - There is no Split choice.
2. **Loan payment fields** (in this order, after "What is this?"):
   - **Loan account:** a Combobox of the `mortgage` and `loan` accounts that are not archived.
   - **Interest:** a money field. For a mortgage with terms, the start value is the interest of the schedule for the
     date and the amount of the transaction, with the hint "From the payment schedule". The person can change it.
     In all other cases the field starts empty and the person types it.
   - **Principal:** read-only: the amount minus the interest.
   - **Interest category:** a Combobox of expense categories. The start value is the interest category of the
     mortgage terms. Else it is the interest category of the last loan payment to that account. Else it is empty.
   - The form checks: interest more than zero, and interest less than the amount.
   - A loan payment has no merchant.
3. **Data.** The transaction has exactly two lines, both money out: a category line (interest) and a transfer line
   to the loan account (principal). The transfer line has a mirror in the loan account, as other transfers do.
4. **API rule.** A transaction with more than one line must be a loan payment as in item 3. Else the API answers 400
   with the error code `lines_not_loan_payment`. This applies to create, update and the MCP tools.
5. **Removed:** the split editor, the line direction, "Money in on this line", "+ Add a line", "$X left" and
   "Put it on the last line".
6. **Not changed:** the learned mortgage payment (decision 0025) and the recurring mortgage item. They make a loan
   payment as in item 3.
7. **Bulk edit (decision 0051):** a loan payment cannot be selected. The tooltip is "Loan payments are changed one
   at a time." The skip reason code `split` becomes `loan_payment`.
8. No data migration. The owner has no transaction with more than one line that is not a mortgage payment.

## Consequences

- Decision 0025 §2 and decision 0051 §1 change. Spec §5.4 (line rules), §7.3 ("What is this?") and `docs/design.md`
  §6a change. The UI uses "Loan payment", not "split" or "mortgage split".
- Logic tests: the API refuses two category lines, two transfer lines, a line with money in, and a transfer line to an
  account that is not a mortgage or a loan; the API accepts a loan payment and creates the mirror of the principal;
  the start interest from the schedule; the start interest category (terms, then the last loan payment).
