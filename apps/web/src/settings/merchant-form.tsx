import { merchantSchema, type Category, type Merchant } from "@num/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { merchantError } from "@/settings/format";

type MerchantFormProps = {
  merchant: Merchant | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
};

export function MerchantForm({ merchant, categories, onClose, onSaved }: MerchantFormProps) {
  const [name, setName] = useState(merchant?.name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(merchant?.defaultCategoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(merchant ? `/api/merchants/${merchant.id}` : "/api/merchants", merchantSchema, {
      method: merchant ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), defaultCategoryId: categoryId }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(merchantError(result.code));
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{merchant ? "Edit merchant" : "New merchant"}</DialogTitle>
        <DialogDescription>The default category is used when no rule and no payee history match.</DialogDescription>
      </DialogHeader>
      <Field data-invalid={error !== null || undefined}>
        <FieldLabel htmlFor="merchant-name">Name</FieldLabel>
        <Input id="merchant-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="merchant-category">Default category</FieldLabel>
        <OptionCombobox
          id="merchant-category"
          value={categoryId}
          options={categories.map((category) => ({ id: category.id, label: category.name }))}
          placeholder="No default category"
          emptyLabel="No default category"
          onChange={setCategoryId}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving" : merchant ? "Save merchant" : "Add merchant"}
        </Button>
      </DialogFooter>
    </form>
  );
}
