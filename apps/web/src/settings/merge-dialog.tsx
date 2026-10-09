import { merchantSchema, type Merchant } from "@num/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogPanel } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { merchantError } from "@/settings/format";

type MergeDialogProps = {
  source: Merchant;
  merchants: Merchant[];
  onClose: () => void;
  onMerged: () => void;
};

export function MergeDialog({ source, merchants, onMerged }: MergeDialogProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = merchants.filter((merchant) => merchant.id !== source.id && merchant.archivedAt === null);

  async function merge() {
    if (!targetId) {
      setError("Choose the merchant that remains.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(`/api/merchants/${source.id}/merge`, merchantSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(merchantError(result.code));
      return;
    }
    onMerged();
  }

  return (
    <DialogPanel>
      <DialogHeader>
        <DialogTitle>Merge this merchant?</DialogTitle>
        <DialogDescription>
          Move transactions and recurring items from {source.name} to the merchant you choose. {source.name} is then archived.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error !== null || undefined}>
        <FieldLabel htmlFor="merge-target">Merchant that remains</FieldLabel>
        <OptionCombobox
          id="merge-target"
          value={targetId}
          options={options.map((merchant) => ({ id: merchant.id, label: merchant.name }))}
          placeholder="Choose a merchant"
          onChange={setTargetId}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" disabled={saving} onClick={() => void merge()}>
          {saving ? "Merging" : "Merge merchants"}
        </Button>
      </DialogFooter>
    </DialogPanel>
  );
}
