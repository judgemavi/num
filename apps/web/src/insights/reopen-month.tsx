import { monthDetailSchema } from "@num/shared";
import { useState } from "react";
import { monthError, monthTitle } from "@/insights/format";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ReopenMonthProps = {
  month: string;
  asOf: string;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function ReopenMonthEditor({ month, asOf, onClose, onSaved }: ReopenMonthProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void (async () => {
          const result = await apiRequest(`/api/months/${month}/reopen?asOf=${asOf}`, monthDetailSchema, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: reason.trim() }),
          });
          setSaving(false);
          if (!result.ok) {
            setError(monthError(result.code));
            return;
          }
          onSaved(month);
        })();
      }}
    >
      <DialogHeader>
        <DialogTitle>Reopen {monthTitle(month)}</DialogTitle>
        <DialogDescription>Give a reason. You can close the month again later.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="reopen-reason">Reason</FieldLabel>
        <Input id="reopen-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} required />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || reason.trim().length === 0}>
          Reopen
        </Button>
      </DialogFooter>
    </form>
  );
}
