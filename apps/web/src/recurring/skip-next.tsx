import { occurrenceLinkSchema, occurrenceListSchema, type Plan } from "@num/shared";
import { useState } from "react";
import { planError } from "@/recurring/format";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogForm } from "@/editors/form-chrome";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type SkipNextProps = {
  plan: Plan | null;
  reason: string;
  asOf: string;
  onReason: (value: string) => void;
  onClose: () => void;
  onDone: () => void;
  onError: (value: string) => void;
};

export function SkipNext({ plan, reason, asOf, onReason, onDone, onError }: SkipNextProps) {
  const [saving, setSaving] = useState(false);
  if (!plan) {
    return null;
  }
  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void (async () => {
          const list = await apiRequest(`/api/recurring/${plan.id}/occurrences?asOf=${asOf}`, occurrenceListSchema);
          if (!list.ok) {
            onError(planError(list.code));
            setSaving(false);
            return;
          }
          const next = list.data.items.find((item) => item.status === "missed" || item.status === "open");
          if (!next) {
            onError("There is no occurrence to skip.");
            setSaving(false);
            return;
          }
          const result = await apiRequest(`/api/recurring/${plan.id}/occurrences/${next.dueDate}/skip`, occurrenceLinkSchema, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: reason.trim() }),
          });
          setSaving(false);
          if (!result.ok) {
            onError(planError(result.code));
            return;
          }
          onDone();
        })();
      }}
    >
      <DialogHeader>
        <DialogTitle>Skip next</DialogTitle>
        <DialogDescription>Skip the next open or missed occurrence of {plan.name}.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="skip-next-reason">Reason</FieldLabel>
        <Input id="skip-next-reason" value={reason} onChange={(event) => onReason(event.target.value)} />
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving || reason.trim().length === 0}>
          Skip
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
