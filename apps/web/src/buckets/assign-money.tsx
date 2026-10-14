import { toMinorUnits, type Bucket, type BucketEventKind } from "@num/shared";
import { useState, type FormEvent } from "react";
import { useAddBucketEvent } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { requestError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { useBookCurrency } from "@/editors/lookups";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";

type AssignMoneyProps = {
  bucket: Bucket;
  kind: Extract<BucketEventKind, "fund" | "release">;
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

export function AssignMoney({ bucket, kind }: AssignMoneyProps) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localAsOf());
  const [note, setNote] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const save = useAddBucketEvent();
  const labels = copy[kind];
  const error = invalid ?? (save.error ? requestError(save.error, "The money did not move. Try again.") : null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    let minor = 0;
    try {
      minor = toMinorUnits(currency, amount.trim());
    } catch {
      setInvalid("Enter the amount as a number.");
      return;
    }
    if (minor < 1) {
      setInvalid("Enter an amount greater than zero.");
      return;
    }
    setInvalid(null);
    save.mutate(
      { bucketId: bucket.id, asOf: localAsOf(), body: { kind, amount: minor, date, note: note.trim() === "" ? null : note.trim() } },
      { onSuccess: () => close("ok") },
    );
  }

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>
          {bucket.name}. {labels.text}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
      <Field>
        <FieldLabel htmlFor="assign-amount">Amount</FieldLabel>
        <Input id="assign-amount" inputMode="decimal" value={amount} required onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="assign-date">Date</FieldLabel>
        <DateField id="assign-date" value={date} required onChange={setDate} />
      </Field>
      <Field>
        <FieldLabel htmlFor="assign-note">Note</FieldLabel>
        <Input id="assign-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {labels.action}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
