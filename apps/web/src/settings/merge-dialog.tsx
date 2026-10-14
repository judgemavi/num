import type { Merchant } from "@num/shared";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { useMergeMerchant } from "@/api/merchants";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { useMerchants } from "@/editors/lookups";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { OptionCombobox } from "@/transactions/option-combobox";
import { merchantError } from "@/settings/format";

export function MergeDialog({ source }: { source: Merchant }) {
  const { close } = useEditorFrame();
  const merchants = useMerchants();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const merge = useMergeMerchant();
  const error = targetMissing ? "Choose the merchant that remains." : merge.error ? merchantError(errorCode(merge.error)) : null;
  const options = merchants.filter((merchant) => merchant.id !== source.id && merchant.archivedAt === null);

  function submit() {
    setTargetMissing(!targetId);
    if (targetId) {
      merge.mutate({ id: source.id, targetId }, { onSuccess: () => close("ok") });
    }
  }

  return (
    <DialogPanel>
      <DialogHeader>
        <DialogTitle>Merge this merchant?</DialogTitle>
        <DialogDescription>
          Move transactions and recurring items from {source.name} to the merchant you choose. {source.name} is then archived.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
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
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" disabled={merge.isPending} onClick={submit}>
          {merge.isPending ? "Merging" : "Merge merchants"}
        </Button>
      </DialogFooter>
    </DialogPanel>
  );
}
