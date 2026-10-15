import { compounding, mortgageFirstPaymentOffPeriod, paymentFrequencies, type Account, type Category } from "@num/shared";
import { useArchiveAccount } from "@/api/accounts";
import { useArchiveCategory } from "@/api/categories";
import { AccountForm } from "@/accounts/account-form";
import { accountLabel } from "@/accounts/label";
import { compoundingLabels, frequencyLabels } from "@/accounts/mortgage-format";
import { blankAccount } from "@/accounts/account-values";
import { draftFromTerms, draftIsBlank, firstPaymentNotAfterOpening } from "@/accounts/mortgage-draft";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useAccounts, useCategories } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { useStore } from "@tanstack/react-form";
import { ManagedPicker } from "@/editors/managed-picker";
import { CategoryForm } from "@/settings/category-form";

export const mortgageTermsHelp = "Add the terms to see the payment schedule and the interest and principal of each payment.";
export const openingDateHelp = "Use the date of the last payment before the first payment in Num. Use the amount owed after that payment.";
const firstPaymentWarning =
  "The first payment is not one payment period after the opening date. The first payment gets more or less interest than a regular payment.";

const compoundingOptions = compounding.map((value) => ({ value, label: compoundingLabels[value] }));
const frequencyOptions = paymentFrequencies.map((value) => ({ value, label: frequencyLabels[value] }));

function accountOptions(accounts: Account[]) {
  return accounts.map((account) => ({ id: account.id, label: accountLabel(account) }));
}

function categoryOptions(categories: Category[]) {
  return categories.map((category) => ({ id: category.id, label: category.name }));
}

/** The mortgage terms of the Account form. The section is open by default. */
export const MortgageSection = withForm({
  defaultValues: blankAccount,
  props: { accountId: fieldValue<string | null>(null) },
  render: function MortgageSectionRender({ form, accountId }) {
    const archiveAccount = useArchiveAccount();
    const archiveCategory = useArchiveCategory();
    const accounts = useAccounts();
    const categories = useCategories();
    const draft = useStore(form.store, (state) => state.values.mortgage);
    const openingDate = useStore(form.store, (state) => state.values.openingDate);
    const keep = (id: string) => id === draft.paymentAccountId || id === draft.propertyAccountId;
    const others = accounts.filter((account) => account.id !== accountId);
    const open = others.filter((account) => account.archivedAt === null || keep(account.id));
    const archivedAccounts = others.filter((account) => account.archivedAt !== null);
    const properties = open.filter((account) => account.kind === "property");
    const archivedProperties = archivedAccounts.filter((account) => account.kind === "property");
    const expense = categories.filter((category) => category.kind === "expense");
    const interest = expense.filter((category) => category.archivedAt === null || category.id === draft.interestCategoryId);
    const archivedInterest = expense.filter((category) => category.archivedAt !== null);
    const beforeOpening = firstPaymentNotAfterOpening(openingDate, draft);
    const offPeriod =
      !beforeOpening &&
      openingDate.length > 0 &&
      draft.firstPaymentDate.length > 0 &&
      mortgageFirstPaymentOffPeriod(openingDate, draft.firstPaymentDate, draft.frequency);

    return (
      <FieldSet>
        <FieldLegend variant="label">Mortgage terms</FieldLegend>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{mortgageTermsHelp}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="mortgage.rate">{(field) => <field.TextField inputMode="decimal" id="mortgage-rate" label="Interest rate (%)" placeholder="5" />}</form.AppField>
            <form.AppField name="mortgage.compounding">
              {(field) => <field.SelectField id="mortgage-compounding" label="Compounded" options={compoundingOptions} />}
            </form.AppField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="mortgage.payment">{(field) => <field.MoneyField id="mortgage-payment" label="Payment" />}</form.AppField>
            <form.AppField name="mortgage.frequency">
              {(field) => <field.SelectField id="mortgage-frequency" label="How often" options={frequencyOptions} />}
            </form.AppField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="mortgage.firstPaymentDate">{(field) => <field.DateInputField id="mortgage-first" label="First payment" />}</form.AppField>
            <form.AppField name="mortgage.termEnd">{(field) => <field.DateInputField id="mortgage-term-end" label="Term ends" />}</form.AppField>
          </div>
          {beforeOpening ? <FieldError>The first payment must be after the opening date.</FieldError> : null}
          {offPeriod ? (
            <p className="text-sm" role="status">
              {firstPaymentWarning}
            </p>
          ) : null}
          <form.AppField name="mortgage.months">
            {(field) => <field.TextField id="mortgage-months" label="Months left on the amortization" inputMode="numeric" autoComplete="off" />}
          </form.AppField>
          <form.Field name="mortgage.paymentAccountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="mortgage-pay-from">Pay from</FieldLabel>
                <ManagedPicker
                  id="mortgage-pay-from"
                  value={field.state.value}
                  options={accountOptions(open)}
                  placeholder="Choose an account"
                  noun="account"
                  archived={accountOptions(archivedAccounts)}
                  onRestore={(id) => archiveAccount.mutate({ id, restore: true }, { onSuccess: (restored) => field.handleChange(restored.id) })}
                  onChange={field.handleChange}
                  renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="mortgage.interestCategoryId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="mortgage-interest">Interest category</FieldLabel>
                <ManagedPicker
                  id="mortgage-interest"
                  value={field.state.value}
                  options={categoryOptions(interest)}
                  placeholder="Choose a category"
                  noun="category"
                  archived={categoryOptions(archivedInterest)}
                  onRestore={(id) => archiveCategory.mutate({ id, restore: true }, { onSuccess: (restored) => field.handleChange(restored.id) })}
                  onChange={field.handleChange}
                  renderForm={(name) => <CategoryForm inline depth={1} category={null} initialName={name} initialKind="expense" />}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="mortgage.propertyAccountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="mortgage-property">Property</FieldLabel>
                <ManagedPicker
                  id="mortgage-property"
                  value={field.state.value}
                  options={accountOptions(properties)}
                  placeholder="No property"
                  emptyLabel="No property"
                  noun="account"
                  archived={accountOptions(archivedProperties)}
                  onRestore={(id) => archiveAccount.mutate({ id, restore: true }, { onSuccess: (restored) => field.handleChange(restored.id) })}
                  onChange={field.handleChange}
                  renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
                />
              </Field>
            )}
          </form.Field>
          {draftIsBlank(draft) ? null : (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => form.setFieldValue("mortgage", draftFromTerms(null))}>
              Remove
            </Button>
          )}
        </div>
      </FieldSet>
    );
  },
});
