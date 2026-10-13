import { inboxDecisionListSchema, merchantSchema, type Merchant } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { undoDecision } from "@/review/actions";
import { decisionText, inboxError } from "@/review/format";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/request";
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
  const [error, setError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const decisions = useQuery({
    queryKey: ["inbox-decisions", merchant?.id],
    enabled: merchant !== null,
    queryFn: async () => {
      const result = await apiRequest("/api/review/decisions", inboxDecisionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items.filter((row) => row.decision === "not_recurring" && merchant !== null && row.itemKey.includes(`:${merchant.id}:`));
    },
  });

  async function submit() {
    if (name.trim().length === 0) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(merchant ? `/api/merchants/${merchant.id}` : "/api/merchants", merchantSchema, {
      method: merchant ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(merchantError(result.code));
      return;
    }
    onSaved(result.data.id);
  }

  return (
    <FormShell inline={inline} className="grid gap-4" onSubmit={() => void submit()}>
      <FormHeading
        inline={inline}
        title={merchant ? "Edit merchant" : "New merchant"}
        description="A merchant groups the transactions of one business."
      />
      <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
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
                await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
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
        <FieldLabel htmlFor={inline ? `merchant-${depth}-name` : "merchant-name"}>Name</FieldLabel>
        <Input id={inline ? `merchant-${depth}-name` : "merchant-name"} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <FormActions inline={inline}>
        <FormCancel inline={inline} onClose={onClose}>
          Cancel
        </FormCancel>
        <Button type={inline ? "button" : "submit"} disabled={saving} onClick={inline ? () => void submit() : undefined}>
          {saving ? "Saving" : merchant ? "Save merchant" : "Add merchant"}
        </Button>
      </FormActions>
    </FormShell>
  );
}
