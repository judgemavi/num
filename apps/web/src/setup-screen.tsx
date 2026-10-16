import { categorySets, setupRequestSchema, type CategorySet, type ErrorCode } from "@num/shared";
import { useCurrencyOptions } from "@/currency-options";
import { OptionCombobox } from "@/transactions/option-combobox";
import { errorCode } from "@/api/client";
import { useCompleteSetup } from "@/api/setup";
import { ChoiceCard } from "@/components/choice-card";
import { choiceIn } from "@/components/choice";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";

function messageFor(code: ErrorCode | undefined) {
  switch (code) {
    case "invalid_body":
      return "Check the currency and the category choice.";
    default:
      return "Setup did not save. Try again.";
  }
}

export function SetupScreen() {
  const setup = useCompleteSetup();
  const currencies = useCurrencyOptions();
  const form = useAppForm({
    defaultValues: { currency: "", categorySet: fieldValue<CategorySet>("default") },
    validators: {
      onSubmit: setupRequestSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await setup.mutateAsync(setupRequestSchema.parse(value));
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: messageFor(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-3 px-4 py-8">
      <p className="font-display flex items-center gap-2.5 text-2xl leading-none font-extrabold [font-stretch:72%]">
        <span className="grid size-7 place-items-center rounded-lg bg-foreground text-base text-background" aria-hidden="true">
          N
        </span>
        Num
      </p>
      <h1 className="font-display text-4xl leading-none font-extrabold uppercase [font-stretch:72%]">Set up your book</h1>
      <p className="text-muted-foreground">Choose the currency for this book. You can change it later in Settings.</p>
      <form.AppForm>
        <form.FormShell className="grid gap-4">
          <form.Field name="currency">
            {(field) => {
              const invalid = field.state.meta.errors.length > 0 && field.state.value.length === 0;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="currency">Currency</FieldLabel>
                  <OptionCombobox
                    id="currency"
                    value={field.state.value}
                    options={currencies}
                    placeholder="Select a currency"
                    invalid={invalid}
                    onChange={(code) => field.handleChange(code ?? "")}
                  />
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="categorySet">
            {(field) => (
              <FieldSet>
                <FieldLegend variant="label">Categories</FieldLegend>
                <RadioGroup
                  name="categorySet"
                  value={field.state.value}
                  onValueChange={(value) => {
                    const next = choiceIn(categorySets, value);
                    if (next) {
                      field.handleChange(next);
                    }
                  }}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ChoiceCard value="default" title="Common categories" description="A short list you can change later." />
                    <ChoiceCard value="none" title="No categories" description="Start with an empty list." />
                  </div>
                </RadioGroup>
              </FieldSet>
            )}
          </form.Field>
          <form.FormError invalid="Choose a currency." />
          <form.SubmitButton saving="Saving">Save</form.SubmitButton>
        </form.FormShell>
      </form.AppForm>
    </main>
  );
}
