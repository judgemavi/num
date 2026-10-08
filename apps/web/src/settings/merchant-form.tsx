import { categoryKindForChoice, inboxDecisionListSchema, merchantSchema, type Category, type Merchant } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useEditors } from "@/editors/editor-api";
import { useRestoreNamed } from "@/editors/restore-named";
import { undoDecision } from "@/inbox/actions";
import { decisionText, inboxError } from "@/inbox/format";
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
  const [undoError, setUndoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState<Category[]>([]);
  const { openEditor } = useEditors();
  const restoreNamed = useRestoreNamed();
  const queryClient = useQueryClient();
  const decisions = useQuery({
    queryKey: ["inbox-decisions", merchant?.id],
    enabled: merchant !== null,
    queryFn: async () => {
      const result = await apiRequest("/api/inbox/decisions", inboxDecisionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items.filter((row) => row.decision === "not_recurring" && merchant !== null && row.itemKey.includes(`:${merchant.id}:`));
    },
  });
  const allCategories = [...categories, ...extra.filter((item) => !categories.some((category) => category.id === item.id))];
  const categoryOptions = allCategories
    .filter((category) => category.archivedAt === null || category.id === categoryId)
    .map((category) => ({ id: category.id, label: category.name }));
  const archivedCategories = allCategories.filter((category) => category.archivedAt).map((category) => ({ id: category.id, label: category.name }));

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
      {(decisions.data ?? []).map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{decisionText(row.decision)}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void undoDecision(row.itemKey).then(async (result) => {
                if (!result.ok) {
                  setUndoError(inboxError(result.code));
                  return;
                }
                setUndoError(null);
                await queryClient.invalidateQueries({ queryKey: ["inbox-decisions"] });
                await queryClient.invalidateQueries({ queryKey: ["inbox"] });
              });
            }}
          >
            Undo
          </Button>
        </p>
      ))}
      {undoError ? (
        <p role="alert" className="text-sm text-attn">
          {undoError}
        </p>
      ) : null}
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
          archived={archivedCategories}
          onRestore={(id) => {
            void restoreNamed(`/api/categories/${id}/restore`).then((restored) => {
              if (restored) {
                setCategoryId(restored);
              }
            });
          }}
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
