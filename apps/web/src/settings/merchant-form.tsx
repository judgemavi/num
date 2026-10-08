import { categoryKindForChoice, merchantSchema, type Category, type Merchant } from "@num/shared";
import { useState, type FormEvent } from "react";
import { useEditors } from "@/editors/editor-api";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { merchantError } from "@/settings/format";

type MerchantFormProps = {
  merchant: Merchant | null;
  initialName?: string;
  categories: Category[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function MerchantForm({ merchant, initialName, categories, onClose, onSaved }: MerchantFormProps) {
  const [name, setName] = useState(merchant?.name ?? initialName ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(merchant?.defaultCategoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState<Category[]>([]);
  const { openEditor } = useEditors();
  const categoryOptions = [...categories, ...extra.filter((item) => !categories.some((category) => category.id === item.id))].map((category) => ({
    id: category.id,
    label: category.name,
  }));

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
    onSaved(result.data.id);
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
          options={categoryOptions}
          placeholder="No default category"
          emptyLabel="No default category"
          create={{
            noun: "category",
            onCreate: (typed) => {
              void openEditor("category", { id: null, name: typed, kind: categoryKindForChoice("spending") ?? "expense" }).then((id) => {
                if (!id) {
                  return;
                }
                setExtra((current) => [...current, { id, name: typed, kind: "expense", groupId: null, essential: false, archivedAt: null }]);
                setCategoryId(id);
              });
            },
          }}
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
