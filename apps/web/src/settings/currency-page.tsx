import { currencyUpdateSchema } from "@num/shared";
import { useSaveBookCurrency } from "@/api/settings";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { CurrencyCombobox } from "@/currency-combobox";
import { useBookCurrency } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { SettingsBack } from "@/settings/settings-nav";

export function CurrencyPage() {
  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="Currency" />
      <Boundary loading="Loading the currency." failed="The currency did not load.">
        <CurrencyForm />
      </Boundary>
    </>
  );
}

function CurrencyForm() {
  const current = useBookCurrency();
  const save = useSaveBookCurrency();
  const form = useAppForm({
    defaultValues: { currency: current },
    validators: {
      onSubmit: currencyUpdateSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value.currency);
      } catch {
        formApi.setErrorMap({ onSubmit: { form: "The currency did not save. Try again.", fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell className="grid max-w-xl gap-4">
        <form.Field name="currency">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="book-currency">Book currency</FieldLabel>
              <CurrencyCombobox id="book-currency" value={field.state.value} onChange={field.handleChange} />
              <FieldDescription>Only the symbol changes. Amounts are not converted.</FieldDescription>
            </Field>
          )}
        </form.Field>
        <form.FormError invalid="Choose a currency." />
        <form.Subscribe selector={(state) => state.values.currency === current}>
          {(unchanged) => (
            <form.SubmitButton disabled={unchanged} saving="Saving currency">
              Save currency
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.FormShell>
    </form.AppForm>
  );
}
