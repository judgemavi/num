import { amountText, isIsoDate } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect } from "react";
import { accountOptionLabel } from "@/accounts/label";
import { loanPaymentDefaultsQuery } from "@/api/mortgage";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { Field, FieldLabel } from "@/components/ui/field";
import { useAccounts, useBookCurrency } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { CategoryPicker } from "@/transactions/pickers";
import { blankTransaction, quietChange, readPositive } from "@/transactions/transaction-draft";

const loanProps = {
  /** True when the loan account and the interest must not change: the amount follows the other side. */
  moneyLocked: false,
  /** False for a saved loan payment: its fields keep the saved values and do not take the start values. */
  fill: true,
  /** The signed amount of the form. Null when the amount is not valid. */
  totalMilli: fieldValue<number | null>(null),
};

/**
 * The fields of a loan payment (decision 0053): the loan account, the interest, the principal and the interest
 * category. The interest and the interest category get their start values when the person chooses the loan account.
 */
export const LoanPaymentFields = withForm({
  defaultValues: blankTransaction,
  props: loanProps,
  render: function LoanPaymentFieldsRender({ form, moneyLocked, fill, totalMilli }) {
    const accounts = useAccounts();
    const loanAccountId = useStore(form.store, (state) => state.values.transferAccountId);
    const date = useStore(form.store, (state) => state.values.date);
    const options = accounts
      .filter((account) => (account.kind === "mortgage" || account.kind === "loan") && (account.archivedAt === null || account.id === loanAccountId))
      .map((account) => ({ id: account.id, label: accountOptionLabel(account) }));
    return (
      <>
        <form.AppField name="transferAccountId">
          {(field) => <field.ComboboxField id="txn-loan-account" label="Loan account" options={options} placeholder="Choose the loan account" disabled={moneyLocked} />}
        </form.AppField>
        {loanAccountId !== null && isIsoDate(date) ? (
          <Boundary look="panel" loading="Loading the payment schedule." failed="The payment schedule did not load.">
            <LoanAmounts form={form} moneyLocked={moneyLocked} fill={fill} totalMilli={totalMilli} loanAccountId={loanAccountId} />
          </Boundary>
        ) : null}
      </>
    );
  },
});

/** The principal: the amount minus the interest. Null while the amount or the interest is not valid. */
function principalOf(currency: string, totalMilli: number | null, interest: string) {
  if (totalMilli === null || interest.trim().length === 0) {
    return null;
  }
  try {
    const principal = Math.abs(totalMilli) - readPositive(currency, interest);
    return principal > 0 ? principal : null;
  } catch {
    return null;
  }
}

const LoanAmounts = withForm({
  defaultValues: blankTransaction,
  props: { ...loanProps, loanAccountId: "" },
  render: function LoanAmountsRender({ form, moneyLocked, fill, totalMilli, loanAccountId }) {
    const currency = useBookCurrency();
    const date = useStore(form.store, (state) => state.values.date);
    const interest = useStore(form.store, (state) => state.values.interest);
    // The fields on the screen stay while the start values for a new account or date load.
    const { data: defaults } = useSuspenseQuery(loanPaymentDefaultsQuery(useDeferredValue(loanAccountId), useDeferredValue(date)));

    // The start values come from the API, outside the form. A field that the person changed keeps its value.
    useEffect(() => {
      if (!fill) {
        return;
      }
      if (!form.getFieldMeta("interest")?.isTouched) {
        form.setFieldValue("interest", defaults.interest === null ? "" : amountText(defaults.interest), quietChange);
      }
      if (!form.getFieldMeta("interestCategoryId")?.isTouched) {
        form.setFieldValue("interestCategoryId", defaults.interestCategoryId, quietChange);
      }
    }, [defaults, fill, form]);

    const fromSchedule = defaults.interest !== null && interest === amountText(defaults.interest);
    const principal = principalOf(currency, totalMilli, interest);
    return (
      <>
        <form.AppField name="interest">
          {(field) => (
            <field.MoneyField id="txn-interest" label="Interest" disabled={moneyLocked} description={fromSchedule ? "From the payment schedule." : undefined} />
          )}
        </form.AppField>
        <Field>
          <FieldLabel>Principal</FieldLabel>
          {principal === null ? <p className="text-sm text-muted-foreground">The amount minus the interest.</p> : <Amount value={principal} />}
        </Field>
        <form.Field name="interestCategoryId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="txn-interest-category">Interest category</FieldLabel>
              <CategoryPicker id="txn-interest-category" value={field.state.value} kind="expense" allowEmpty={false} onChange={field.handleChange} />
            </Field>
          )}
        </form.Field>
      </>
    );
  },
});
