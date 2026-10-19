import { useDraftSuggestion } from "@/transactions/use-draft-suggestion";
import {
  accountFitsChoice,
  categoryKindForChoice,
  choicesForDirection,
  merchantForChoice,
  whatChoices,
  type Suggestion,
  type WhatChoice,
} from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { choiceIn } from "@/components/choice";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccountLabels, useAccounts, useBookCurrency, useCategories, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { CategoryPicker, MerchantPicker } from "@/transactions/pickers";
import { TransferAccountField } from "@/transactions/transaction-parts";
import { LoanPaymentFields } from "@/transactions/loan-payment-fields";
import { RefundOfField } from "@/transactions/refund-of-field";
import { levelLabel } from "@/transactions/format";
import { blankTransaction, directionOf, quietChange, signedTotal } from "@/transactions/transaction-draft";

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

/**
 * "What is this?": the type of the transaction, the first field of the form. A manual transaction has all types. An
 * imported transaction keeps its sign: it has only the types of its direction.
 */
export const WhatIsThis = withForm({
  defaultValues: blankTransaction,
  props: {
    locked: false,
    imported: false,
    /** The account that the form starts with. It stays in the Account list for each type. */
    startAccountId: fieldValue<string | null>(null),
  },
  render: function WhatIsThisRender({ form, locked, imported, startAccountId }) {
    const categories = useCategories();
    const accounts = useAccounts();
    const transferSide = useStore(form.store, (state) => state.values.transferSide);
    const choices = imported ? choicesForDirection(transferSide) : [...whatChoices];
    return (
      <form.Field
        name="choice"
        listeners={{
          // A new type keeps only the fields that fit it. A loan payment goes only to a mortgage or a loan.
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
            // The account of a manual transaction must be in the list of the new type.
            const account = accounts.find((item) => item.id === draft.getFieldValue("accountId"));
            if (!imported && account && account.id !== startAccountId && !accountFitsChoice(next, account.kind)) {
              draft.setFieldValue("accountId", "", quietChange);
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
              disabled={locked}
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
    );
  },
});

/** The fields of the type: the category, the transfer account of an import, the loan payment and the merchant. */
export const ChoiceFields = withForm({
  defaultValues: blankTransaction,
  props: {
    locked: false,
    imported: false,
    transactionId: fieldValue<string | null>(null),
    /** False for a saved loan payment: its fields keep the saved values. */
    loanFill: true,
    /** The stored amount while the amount is unchanged, or the amount of an imported transaction. */
    storedAmount: fieldValue<number | null>(null),
  },
  render: function ChoiceFieldsRender({ form, locked, imported, transactionId, loanFill, storedAmount }) {
    const currency = useBookCurrency();
    const values = useStore(form.store, (state) => state.values);
    const { choice, refundOfId } = values;
    const totalMilli = signedTotal(currency, storedAmount, values.amount, directionOf(values));
    const { suggestion } = useDraftSuggestion(values, storedAmount);
    const categoryKind = categoryKindForChoice(choice);

    return (
      <div className="grid gap-4">
        {choice === "refund" && values.date.length > 0 ? <RefundOfField form={form} transactionId={transactionId} /> : null}
        {categoryKind !== null && (choice !== "refund" || refundOfId === null) ? (
          <form.Field name="categoryId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="txn-category">Category</FieldLabel>
                <CategoryPicker id="txn-category" value={field.state.value} kind={categoryKind} allowEmpty disabled={locked} onChange={field.handleChange} />
              </Field>
            )}
          </form.Field>
        ) : null}
        {/* The account of an import is the fixed side of a transfer. The person picks the other side. */}
        {choice === "transfer" && imported ? (
          <TransferAccountField
            form={form}
            label={values.transferSide === "out" ? "To account" : "From account"}
            locked={locked}
            transactionId={transactionId}
          />
        ) : null}
        {choice === "loan_payment" ? <LoanPaymentFields form={form} moneyLocked={locked} fill={loanFill} totalMilli={totalMilli} /> : null}
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
