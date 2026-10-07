import { currencyCodes, setupRequestSchema, setupResultSchema, type CategorySet, type CurrencyCode } from "@num/shared";
import { useState, type FormEvent } from "react";
import { CurrencyCombobox } from "@/currency-combobox";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type SetupScreenProps = {
  onDone: () => void;
};

function messageFor(code: string): string {
  switch (code) {
    case "setup_already_complete":
      return "Setup is already complete.";
    case "invalid_body":
      return "Check the currency and the category choice.";
    default:
      return "Setup did not save. Try again.";
  }
}

function isCurrency(code: string): code is CurrencyCode {
  return (currencyCodes as readonly string[]).includes(code);
}

export function SetupScreen({ onDone }: SetupScreenProps) {
  const [currency, setCurrency] = useState("");
  const [categorySet, setCategorySet] = useState<CategorySet>("default");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCurrency(currency)) {
      setError("Choose a currency.");
      return;
    }
    const body = setupRequestSchema.safeParse({ currency, categorySet });
    if (!body.success) {
      setError("Choose a currency.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest("/api/setup", setupResultSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.data),
      });
      if (!result.ok) {
        if (result.code === "setup_already_complete") {
          onDone();
          return;
        }
        setError(messageFor(result.code));
        return;
      }
      onDone();
    } catch {
      setError("Setup did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Set up your book</h1>
      <p className="mt-2 text-muted-foreground">
        Choose the currency for this book. You cannot change it after you add a transaction.
      </p>
      <form className="mt-8 flex flex-col gap-6" onSubmit={(event) => void onSubmit(event)}>
        <Field data-invalid={error !== null && currency.length === 0}>
          <FieldLabel htmlFor="currency">Currency</FieldLabel>
          <CurrencyCombobox
            id="currency"
            value={currency}
            invalid={error !== null && currency.length === 0}
            onChange={setCurrency}
          />
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Categories</FieldLegend>
          <RadioGroup
            name="categorySet"
            value={categorySet}
            onValueChange={(value) => {
              if (value === "default" || value === "none") {
                setCategorySet(value);
              }
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id="categories-default" value="default" />
              <FieldContent>
                <FieldLabel htmlFor="categories-default">Common categories</FieldLabel>
                <FieldDescription>A short list you can change later.</FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id="categories-none" value="none" />
              <FieldContent>
                <FieldLabel htmlFor="categories-none">No categories</FieldLabel>
                <FieldDescription>Start with an empty list.</FieldDescription>
              </FieldContent>
            </Field>
          </RadioGroup>
        </FieldSet>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Saving setup" : "Save setup"}
        </Button>
      </form>
    </main>
  );
}
