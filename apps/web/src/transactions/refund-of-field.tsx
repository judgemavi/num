import { categoryForRefund, type Transaction, type TransactionReview } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { refundPurchasesQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { refundPurchaseLabel } from "@/transactions/format";
import { blankTransaction } from "@/transactions/transaction-draft";
import { OptionCombobox } from "@/transactions/option-combobox";

const refundProps = {
  linked: fieldValue<Transaction["refundOf"]>(null),
  /** The candidate purchases of the question "Refund of which purchase?". The list shows them first (decision 0047). */
  candidates: fieldValue<NonNullable<TransactionReview["refund"]>["purchases"]>([]),
};

/** The purchase that a refund returns. A chosen purchase gives the category and the merchant of the refund. */
export const RefundOfField = withForm({
  defaultValues: blankTransaction,
  props: refundProps,
  render: function RefundOfFieldRender({ form, linked, candidates }) {
    return (
      <Boundary look="panel" loading="Loading the purchases." failed="The purchases did not load.">
        <RefundOf form={form} linked={linked} candidates={candidates} />
      </Boundary>
    );
  },
});

const RefundOf = withForm({
  defaultValues: blankTransaction,
  props: refundProps,
  render: function RefundOfRender({ form, linked, candidates }) {
    const currency = useBookCurrency();
    const { date, payee, categoryId, merchantId } = useStore(form.store, (state) => state.values);
    const categoryName = useCategoryNames().get(categoryId ?? "");
    const merchantName = useMerchantNames().get(merchantId ?? "");
    // The purchases on the screen stay while the purchases for a new payee text load.
    const { data: purchases } = useSuspenseQuery(refundPurchasesQuery(date, useDeferredValue(payee)));
    const label = (item: { id: string; payeeRaw: string; date: string; amount: number }) => ({
      id: item.id,
      label: refundPurchaseLabel(currency, item.payeeRaw, item.date, item.amount),
    });
    const options = [...candidates.map(label), ...purchases.filter((item) => !candidates.some((first) => first.id === item.id)).map(label)];
    return (
      <form.Field name="refundOfId">
        {(field) => {
          const value = field.state.value;
          const withLinked =
            linked && value === linked.id && !options.some((option) => option.id === linked.id)
              ? [label(linked), ...options]
              : options;
          return (
            <Field>
              <FieldLabel htmlFor="txn-refund-of">Refund of…</FieldLabel>
              <OptionCombobox
                id="txn-refund-of"
                value={value}
                options={withLinked}
                placeholder="No purchase"
                emptyLabel="No purchase"
                preserveOrder
                onChange={(next) => {
                  field.handleChange(next);
                  const item = purchases.find((row) => row.id === next);
                  if (item) {
                    form.setFieldValue("categoryId", categoryForRefund(item));
                    form.setFieldValue("merchantId", item.merchantId);
                  }
                }}
              />
              {value ? (
                <FieldDescription>
                  {[categoryName ?? "No category", merchantName].filter((part) => part !== undefined).join(" · ")} (from the purchase)
                </FieldDescription>
              ) : null}
            </Field>
          );
        }}
      </form.Field>
    );
  },
});
