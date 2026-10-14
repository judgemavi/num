import type { TransactionReview } from "@num/shared";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useActivePlans } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { formatDate } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { blankTransaction } from "@/transactions/transaction-draft";

/**
 * "Payment for…": the answer to "Which payment is this?" (decision 0047). It starts empty, because more than one
 * transaction can be that payment. Save with the payment links the transaction to it.
 */
export const PaymentForField = withForm({
  defaultValues: blankTransaction,
  props: { occurrence: fieldValue<NonNullable<TransactionReview["recurring"]>>({ planId: "", dueDate: "" }) },
  render: function PaymentForFieldRender({ form, occurrence }) {
    const plan = useActivePlans().items.find((item) => item.id === occurrence.planId);
    const option = {
      id: `${occurrence.planId}:${occurrence.dueDate}`,
      label: `${plan?.name ?? "Recurring payment"} · due ${formatDate(occurrence.dueDate)}`,
    };
    return (
      <form.Field name="paymentFor">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="txn-payment-for">Payment for…</FieldLabel>
            <OptionCombobox
              id="txn-payment-for"
              value={field.state.value}
              options={[option]}
              placeholder="Choose the payment"
              emptyLabel="Not this payment"
              onChange={field.handleChange}
            />
            <FieldDescription>More than one transaction can be this payment. Choose it only for the right one.</FieldDescription>
          </Field>
        )}
      </form.Field>
    );
  },
});
