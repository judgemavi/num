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

function reasonText(suggestion: Suggestion) {
  switch (suggestion.reason) {
    case "recurring":
      return "Matches your recurring payment";
    case "learned_amount":
      return "You chose this for this payee and amount";
    case "learned_payee":
      return "You chose this for this payee";
    case "similar":
      return suggestion.sourceName ? `Same as ${suggestion.sourceName}` : "Same as a similar payee";
    case "family":
      return suggestion.sourceName ? `Same as other ${suggestion.sourceName} payees` : "Same as other payees of this brand";
    case "refund_match":
      return "Same payee and amount as a purchase";
    case "refund_reversal":
      return "Same amount and category as a purchase";
    case "transfer_match":
      return "Same amount moved between your accounts";
    case "none":
      return "";
  }
}

/** The line under the merchant that tells what Num suggests and why. It shows only when a suggestion has a name to show. */
function SuggestionHint({ suggestion }: { suggestion: Suggestion }) {
  const merchant = useMerchantNames().get(suggestion.merchantId ?? "");
  const category = useCategoryNames().get(suggestion.categoryId ?? "");
  const account = useAccountLabels().get(suggestion.transferAccountId ?? "");
  const parts = [merchant ? `Merchant: ${merchant}` : null, category ? `Category: ${category}` : null, account ? `Transfer: ${account}` : null].filter(
    (part): part is string => part !== null,
  );
  if (suggestion.reason === "none" || parts.length === 0) {
    return null;
  }
  const label = suggestion.level === "none" ? null : levelLabel(suggestion.level);
  const text = `${parts.join(". ")}. ${reasonText(suggestion)}`;
  return <FieldDescription role="status">{label ? `${label}. ${text}` : text}</FieldDescription>;
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
    importedAmount: fieldValue<number | null>(null),
    /** The purchase that the saved refund links to. */
    linkedRefund: fieldValue<Transaction["refundOf"]>(null),
  },
  render: function WhatIsThisRender({ form, choiceLocked, categoryLocked, transferLocked, amountsLocked, importedAmount, linkedRefund }) {
    const currency = useBookCurrency();
    const categories = useCategories();
    const values = useStore(form.store, (state) => state.values);
    const { direction, choice, refundOfId, accountId } = values;
    const totalMinor = signedTotal(currency, importedAmount, values.amount, direction);
    const { suggestion } = useSuggestion({ accountId, payee: values.payee, date: values.date, direction, amount: totalMinor });
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
          <SplitLines form={form} totalMinor={totalMinor} categoryLocked={categoryLocked} transferLocked={transferLocked} amountsLocked={amountsLocked} />
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
