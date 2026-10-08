import { bucketEventSchema, toMinorUnits, type Bucket, type BucketEventKind } from "@num/shared";
import { useState, type FormEvent } from "react";
import { bucketError, today } from "@/buckets/format";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type AssignMoneyProps = {
  currency: string;
  bucket: Bucket;
  kind: Extract<BucketEventKind, "fund" | "release">;
  onClose: () => void;
  onSaved: () => void;
};

const copy = {
  fund: {
    title: "Fund from Unassigned",
    text: "Move money from Unassigned into this bucket. This does not move money between accounts.",
    action: "Fund",
  },
  release: {
    title: "Release to Unassigned",
    text: "Move money from this bucket back to Unassigned. This does not move money between accounts.",
    action: "Release",
  },
} as const;

export function AssignMoney({ currency, bucket, kind, onClose, onSaved }: AssignMoneyProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labels = copy[kind];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let minor = 0;
    try {
      minor = toMinorUnits(currency, amount.trim());
    } catch {
      setError("Enter the amount as a number.");
      return;
    }
    if (minor < 1) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest(`/api/buckets/${bucket.id}/events`, bucketEventSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          amount: minor,
          date,
          note: note.trim() === "" ? null : note.trim(),
        }),
      });
      if (!result.ok) {
        setError(bucketError(result.code));
        return;
      }
      onSaved();
    } catch {
      setError("The money did not move. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>
          {bucket.name}. {labels.text}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="assign-amount">Amount</FieldLabel>
        <Input id="assign-amount" inputMode="decimal" value={amount} required onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="assign-date">Date</FieldLabel>
        <Input id="assign-date" type="date" value={date} required onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="assign-note">Note</FieldLabel>
        <Input id="assign-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {labels.action}
        </Button>
      </DialogFooter>
    </form>
  );
}
