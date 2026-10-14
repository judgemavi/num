import { toMinorUnits } from "@num/shared";
import { useState, type FormEvent } from "react";
import { useAddBucketEvent } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { requestError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { useActiveBuckets, useBookCurrency } from "@/editors/lookups";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Move money from one active bucket to another. `fromId` is the bucket that the person started from. */
export function MoveMoney({ fromId }: EditorInput["moveMoney"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const active = useActiveBuckets().items;
  const [from, setFrom] = useState(fromId ?? active[0]?.id ?? "");
  const [to, setTo] = useState(active.find((bucket) => bucket.id !== (fromId ?? active[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localAsOf());
  const [note, setNote] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const save = useAddBucketEvent();
  const error = invalid ?? (save.error ? requestError(save.error, "The money did not move. Try again.") : null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!from || !to || from === to) {
      setInvalid("Choose two different buckets.");
      return;
    }
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
      { bucketId: from, asOf: localAsOf(), body: { kind: "move", amount: minor, date, otherBucketId: to, note: note.trim() === "" ? null : note.trim() } },
      { onSuccess: () => close("ok") },
    );
  }

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Move money</DialogTitle>
        <DialogDescription>Move money from one bucket to another. This does not move money between accounts.</DialogDescription>
      </DialogHeader>
      <DialogBody>
      <Field>
        <FieldLabel htmlFor="move-from">From</FieldLabel>
        <Select value={from || undefined} onValueChange={setFrom}>
          <SelectTrigger id="move-from" className="w-full">
            <SelectValue placeholder="Choose a bucket" />
          </SelectTrigger>
          <SelectContent>
            {active.map((bucket) => (
              <SelectItem key={bucket.id} value={bucket.id}>
                {bucket.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="move-to">To</FieldLabel>
        <Select value={to || undefined} onValueChange={setTo}>
          <SelectTrigger id="move-to" className="w-full">
            <SelectValue placeholder="Choose a bucket" />
          </SelectTrigger>
          <SelectContent>
            {active
              .filter((bucket) => bucket.id !== from)
              .map((bucket) => (
                <SelectItem key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="move-amount">Amount</FieldLabel>
        <Input id="move-amount" inputMode="decimal" value={amount} required onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="move-date">Date</FieldLabel>
        <DateField id="move-date" value={date} required onChange={setDate} />
      </Field>
      <Field>
        <FieldLabel htmlFor="move-note">Note</FieldLabel>
        <Input id="move-note" value={note} onChange={(event) => setNote(event.target.value)} />
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
          Move
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
