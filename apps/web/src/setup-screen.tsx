import { currencyCodes, setupRequestSchema, setupResultSchema, type CategorySet } from "@num/shared";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SetupScreenProps = {
  onDone: () => void;
};

function currencyLabel(code: string, names: Intl.DisplayNames | null): string {
  const name = names?.of(code);
  if (!name || name.toUpperCase() === code) {
    return code;
  }
  return `${name} (${code})`;
}

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

export function SetupScreen({ onDone }: SetupScreenProps) {
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("");
  const [categorySet, setCategorySet] = useState<CategorySet>("default");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const names = useMemo(() => {
    if (typeof Intl.DisplayNames !== "function") {
      return null;
    }
    return new Intl.DisplayNames(undefined, { type: "currency" });
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = currencyCodes.filter((code) => {
      if (needle.length === 0) {
        return true;
      }
      const label = currencyLabel(code, names).toLowerCase();
      return label.includes(needle) || code.toLowerCase().includes(needle);
    });
    const selected = currencyCodes.find((code) => code === currency);
    if (selected && !matches.includes(selected)) {
      return [selected, ...matches];
    }
    return matches;
  }, [currency, names, query]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        <div className="flex flex-col gap-2">
          <label htmlFor="currency-search">Currency</label>
          <Input
            id="currency-search"
            value={query}
            autoComplete="off"
            placeholder="Search by name or code"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            id="currency"
            className="h-36 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base"
            size={6}
            required
            value={currency}
            aria-invalid={error !== null}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="">Select a currency</option>
            {visible.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code, names)}
              </option>
            ))}
          </select>
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">No currency matches.</p> : null}
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend>Categories</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="categorySet"
              value="default"
              checked={categorySet === "default"}
              onChange={() => setCategorySet("default")}
            />
            <span>
              Common categories
              <span className="block text-sm text-muted-foreground">A short list you can change later.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="categorySet"
              value="none"
              checked={categorySet === "none"}
              onChange={() => setCategorySet("none")}
            />
            <span>
              No categories
              <span className="block text-sm text-muted-foreground">Start with an empty list.</span>
            </span>
          </label>
        </fieldset>
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
