import { categoryKindForChoice, choicesForDirection, merchantForChoice, type Suggestion, type Transaction, type WhatChoice } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { choiceIn } from "@/components/choice";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccountLabels, useBookCurrency, useCategories, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { AccountPicker, CategoryPicker, MerchantPicker } from "@/transactions/pickers";
import { SplitLines } from "@/transactions/split-line-row";
import { RefundOfField } from "@/transactions/refund-of-field";
import { levelLabel } from "@/transactions/format";
import { blankTransaction, quietChange, signedTotal, useSuggestion } from "@/transactions/transaction-draft";
import type { SplitLine } from "@/transactions/what-choice";

const choiceLabel: Record<WhatChoice, string> = {
  spending: "Spending",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  split: "Split",
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

/** The choice of the transaction and its fields: the category, the transfer account, the lines and the merchant. */
export const WhatIsThis = withForm({
  defaultValues: blankTransaction,
  props: {
    choiceLocked: false,
    categoryLocked: false,
    transferLocked: false,
    amountsLocked: false,
    /** The amount of an imported transaction. Null when the person enters the amount. */
    /** The stored amount while the amount is unchanged, or the amount of an imported transaction. */
    storedAmount: fieldValue<number | null>(null),
    /** The purchase that the saved refund links to. */
    linkedRefund: fieldValue<Transaction["refundOf"]>(null),
  },
  render: function WhatIsThisRender({ form, choiceLocked, categoryLocked, transferLocked, amountsLocked, storedAmount, linkedRefund }) {
    const currency = useBookCurrency();
    const categories = useCategories();
    const values = useStore(form.store, (state) => state.values);
    const { direction, choice, refundOfId, accountId } = values;
    const totalMilli = signedTotal(currency, storedAmount, values.amount, direction);
    const { suggestion } = useSuggestion({ accountId, payee: values.payee, date: values.date, direction, amount: totalMilli });
    const choices = choicesForDirection(direction);
    const categoryKind = categoryKindForChoice(choice);

    return (
      <div className="grid gap-4">
        <form.Field
          name="choice"
          listeners={{
            // A new choice keeps only the fields that fit it. Split starts with two lines.
            onChange: ({ value: next, fieldApi }) => {
              const draft = fieldApi.form;
              draft.setFieldValue("merchantId", (current) => merchantForChoice(next, current), quietChange);
              if (next !== "refund") {
                draft.setFieldValue("refundOfId", null, quietChange);
              }
              const kind = categories.find((category) => category.id === draft.getFieldValue("categoryId"))?.kind ?? null;
              if (next !== "transfer" && next !== "split" && kind && kind !== categoryKindForChoice(next)) {
                draft.setFieldValue("categoryId", null, quietChange);
              }
              if (next === "split" && draft.getFieldValue("lines").length < 2) {
                draft.setFieldValue("lines", firstLines(draft.getFieldValue("amount"), draft.getFieldValue("categoryId")), quietChange);
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
        {choice === "refund" && values.date.length > 0 ? <RefundOfField form={form} linked={linkedRefund} /> : null}
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
              </Field>
            )}
          </form.Field>
        ) : null}
        {choice === "split" ? (
          <SplitLines form={form} totalMilli={totalMilli} categoryLocked={categoryLocked} transferLocked={transferLocked} amountsLocked={amountsLocked} />
        ) : null}
        {choice === "transfer" || (choice === "refund" && refundOfId !== null) ? null : (
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

/** The two lines of a new split: the first line has the amount and the category, the second line is empty. */
function firstLines(amount: string, categoryId: string | null): SplitLine[] {
  return [
    { key: crypto.randomUUID(), amount, opposite: false, edited: false, categoryId, transferAccountId: null },
    { key: crypto.randomUUID(), amount: "", opposite: false, edited: false, categoryId: null, transferAccountId: null },
  ];
}
