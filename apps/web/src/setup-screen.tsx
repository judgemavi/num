import { currencyCodes, setupRequestSchema, setupResultSchema, type CategorySet, type CurrencyCode } from "@num/shared";
import { useState, type FormEvent } from "react";
import { CurrencyCombobox } from "@/currency-combobox";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/choice-card";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";

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
    <main className="mx-auto grid min-h-svh w-full max-w-xl content-center gap-3 px-4 py-8">
      <p className="font-display flex items-center gap-2.5 text-2xl leading-none font-extrabold [font-stretch:72%]">
        <span className="grid size-7 place-items-center rounded-lg bg-foreground text-base text-background" aria-hidden="true">
          N
        </span>
        Num
      </p>
      <h1 className="font-display text-4xl leading-none font-extrabold uppercase [font-stretch:72%]">Set up your book</h1>
      <p className="text-muted-foreground">Choose the currency for this book. You cannot change it after you add a transaction.</p>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <Field data-invalid={error !== null && currency.length === 0}>
          <FieldLabel htmlFor="currency">Currency</FieldLabel>
          <CurrencyCombobox id="currency" value={currency} invalid={error !== null && currency.length === 0} onChange={setCurrency} />
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ChoiceCard value="default" title="Common categories" description="A short list you can change later." />
              <ChoiceCard value="none" title="No categories" description="Start with an empty list." />
            </div>
          </RadioGroup>
        </FieldSet>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving setup" : "Save setup"}
        </Button>
      </form>
    </main>
  );
}
