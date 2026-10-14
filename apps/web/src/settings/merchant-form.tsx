import type { Merchant } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { useSaveMerchant } from "@/api/merchants";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { decisionText, inboxError } from "@/review/format";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { merchantError } from "@/settings/format";

type MerchantFormProps = {
  merchant: Merchant | null;
  initialName?: string;
  inline?: boolean;
  depth?: number;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function MerchantForm({ merchant, initialName, inline = false, depth = 0, onClose, onSaved }: MerchantFormProps) {
  const [name, setName] = useState(merchant?.name ?? initialName ?? "");
  const [nameMissing, setNameMissing] = useState(false);
  const save = useSaveMerchant();
  const undo = useUndoDecision();
  const decisions = useQuery({
    ...inboxDecisionsQuery(),
    enabled: merchant !== null,
    select: (rows) => rows.filter((row) => row.decision === "not_recurring" && merchant !== null && row.itemKey.includes(`:${merchant.id}:`)),
  });
  const error = nameMissing ? "Enter a name." : save.error ? merchantError(errorCode(save.error)) : null;

  function submit() {
    const trimmed = name.trim();
    setNameMissing(trimmed.length === 0);
    if (trimmed.length > 0) {
      save.mutate({ id: merchant?.id ?? null, name: trimmed }, { onSuccess: (saved) => onSaved(saved.id) });
    }
  }

  return (
    <FormShell inline={inline} className="grid gap-4" onSubmit={submit}>
      <FormHeading
        inline={inline}
        title={merchant ? "Edit merchant" : "New merchant"}
        description="A merchant groups the transactions of one business."
      />
      <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
      {(decisions.data ?? []).map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{decisionText(row.decision)}</span>
          <Button type="button" variant="outline" onClick={() => undo.mutate(row.itemKey)}>
            Undo
          </Button>
        </p>
      ))}
      {undo.error ? (
        <p role="alert" className="text-sm text-attn">
          {inboxError(errorCode(undo.error) ?? "internal_error")}
        </p>
      ) : null}
      <Field data-invalid={error !== null || undefined}>
        <FieldLabel htmlFor={inline ? `merchant-${depth}-name` : "merchant-name"}>Name</FieldLabel>
        <Input id={inline ? `merchant-${depth}-name` : "merchant-name"} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <FormActions inline={inline}>
        <FormCancel inline={inline} onClose={onClose}>
          Cancel
        </FormCancel>
        <Button type={inline ? "button" : "submit"} disabled={save.isPending} onClick={inline ? submit : undefined}>
          {save.isPending ? "Saving" : merchant ? "Save merchant" : "Add merchant"}
        </Button>
      </FormActions>
    </FormShell>
  );
}
