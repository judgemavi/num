import {
  categoryKindForChoice,
  choicesForDirection,
  merchantForChoice,
  type Suggestion,
  type Transaction,
  type TransactionReview,
  type WhatChoice,
} from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { choiceIn } from "@/components/choice";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccountLabels, useAccounts, useBookCurrency, useCategories, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { AccountPicker, CategoryPicker, MerchantPicker } from "@/transactions/pickers";
import { LoanPaymentFields } from "@/transactions/loan-payment-fields";
import { RefundOfField } from "@/transactions/refund-of-field";
import { levelLabel, refundPurchaseLabel } from "@/transactions/format";
import { blankTransaction, quietChange, signedTotal, useSuggestion } from "@/transactions/transaction-draft";

const choiceLabel: Record<WhatChoice, string> = {
  spending: "Spending",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  loan_payment: "Loan payment",
};

/** The line under the merchant that tells what Num suggests and its level. It shows only when a suggestion has a name to show. */
function SuggestionHint({ suggestion }: { suggestion: Suggestion }) {
  const merchant = useMerchantNames().get(suggestion.merchantId ?? "");
  const category = useCategoryNames().get(suggestion.categoryId ?? "");
  const account = useAccountLabels().get(suggestion.transferAccountId ?? "");
  const parts = suggestion.mortgage
    ? [account ? `Mortgage payment · ${account}` : null]
    : [
        merchant ? `Merchant: ${merchant}` : null,
        suggestion.keep ? "No category" : category ? `Category: ${category}` : null,
        account ? `Transfer: ${account}` : null,
      ];
  const shown = parts.filter((part): part is string => part !== null);
  if (suggestion.reason === "none" || shown.length === 0) {
    return null;
  }
  const text = `${shown.join(". ")}.`;
  return <FieldDescription role="status">{suggestion.level === "none" ? text : `${levelLabel(suggestion.level)}. ${text}`}</FieldDescription>;
}

/** The choice of the transaction and its fields: the category, the transfer account, the loan payment and the merchant. */
export const WhatIsThis = withForm({
  defaultValues: blankTransaction,
  props: {
    choiceLocked: false,
    categoryLocked: false,
    transferLocked: false,
    amountsLocked: false,
    /** False for a saved loan payment: its fields keep the saved values. */
    loanFill: true,
    /** The stored amount while the amount is unchanged, or the amount of an imported transaction. */
    storedAmount: fieldValue<number | null>(null),
    /** The purchase that the saved refund links to. */
    linkedRefund: fieldValue<Transaction["refundOf"]>(null),
    /** The proposed transfer pair: the other transaction. */
    pair: fieldValue<TransactionReview["transfer"]>(null),
    /** The candidate purchases of the question "Refund of which purchase?". */
    refundCandidates: fieldValue<NonNullable<TransactionReview["refund"]>["purchases"]>([]),
  },
  render: function WhatIsThisRender({
    form,
    choiceLocked,
    categoryLocked,
    transferLocked,
    amountsLocked,
    loanFill,
    storedAmount,
    linkedRefund,
    pair,
    refundCandidates,
  }) {
    const currency = useBookCurrency();
    const categories = useCategories();
    const accounts = useAccounts();
    const values = useStore(form.store, (state) => state.values);
    const { direction, choice, refundOfId, accountId } = values;
    const totalMilli = signedTotal(currency, storedAmount, values.amount, direction);
    const { suggestion } = useSuggestion(
      { accountId, payee: values.suggestionPayee, date: values.date, direction, amount: signedTotal(currency, storedAmount, values.suggestionAmount, direction) },
      values.payee === values.suggestionPayee && values.amount === values.suggestionAmount,
    );
    const choices = choicesForDirection(direction);
    const categoryKind = categoryKindForChoice(choice);

    return (
      <div className="grid gap-4">
        <form.Field
          name="choice"
          listeners={{
            // A new choice keeps only the fields that fit it. A loan payment goes only to a mortgage or a loan.
            onChange: ({ value: next, fieldApi }) => {
              const draft = fieldApi.form;
              draft.setFieldValue("merchantId", (current) => merchantForChoice(next, current), quietChange);
              if (next !== "refund") {
                draft.setFieldValue("refundOfId", null, quietChange);
              }
              const kind = categories.find((category) => category.id === draft.getFieldValue("categoryId"))?.kind ?? null;
              if (next !== "transfer" && kind && kind !== categoryKindForChoice(next)) {
                draft.setFieldValue("categoryId", null, quietChange);
              }
              const target = accounts.find((account) => account.id === draft.getFieldValue("transferAccountId"))?.kind;
              if (next === "loan_payment" && target !== "mortgage" && target !== "loan") {
                draft.setFieldValue("transferAccountId", null, quietChange);
              }
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel>What is this?</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                value={choices.includes(field.state.value) ? field.state.value : ""}
                disabled={choiceLocked}
                onValueChange={(value) => {
                  const next = choiceIn(choices, value);
                  if (next) {
                    field.handleChange(next);
                  }
                }}
              >
                {choices.map((item) => (
                  <ToggleGroupItem key={item} value={item}>
                    {choiceLabel[item]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
        </form.Field>
        {choice === "refund" && values.date.length > 0 ? <RefundOfField form={form} linked={linkedRefund} candidates={refundCandidates} /> : null}
        {categoryKind !== null && (choice !== "refund" || refundOfId === null) ? (
          <form.Field name="categoryId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="txn-category">Category</FieldLabel>
                <CategoryPicker id="txn-category" value={field.state.value} kind={categoryKind} allowEmpty disabled={categoryLocked} onChange={field.handleChange} />
              </Field>
            )}
          </form.Field>
        ) : null}
        {choice === "transfer" ? (
          <form.Field name="transferAccountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="txn-transfer">{direction === "out" ? "To account" : "From account"}</FieldLabel>
                <AccountPicker id="txn-transfer" value={field.state.value} exceptId={accountId} disabled={transferLocked} onChange={field.handleChange} />
                {pair && field.state.value === pair.otherAccountId ? (
                  <FieldDescription>{`Links to ${refundPurchaseLabel(currency, pair.otherPayee, pair.otherDate, pair.otherAmount)}.`}</FieldDescription>
                ) : null}
              </Field>
            )}
          </form.Field>
        ) : null}
        {choice === "loan_payment" ? <LoanPaymentFields form={form} moneyLocked={transferLocked || amountsLocked} fill={loanFill} totalMilli={totalMilli} /> : null}
        {choice === "loan_payment" && suggestion?.mortgage ? <SuggestionHint suggestion={suggestion} /> : null}
        {choice === "transfer" || choice === "loan_payment" || (choice === "refund" && refundOfId !== null) ? null : (
          <form.Field name="merchantId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="txn-merchant">Merchant</FieldLabel>
                <MerchantPicker id="txn-merchant" value={field.state.value} payee={values.payee} onChange={field.handleChange} />
                {suggestion ? <SuggestionHint suggestion={suggestion} /> : null}
              </Field>
            )}
          </form.Field>
        )}
      </div>
    );
  },
});
