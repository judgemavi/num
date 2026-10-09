import { bucketEventSchema, toMinorUnits, type Bucket } from "@num/shared";
import { useState, type FormEvent } from "react";
import { bucketError, today } from "@/buckets/format";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogForm } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MoveMoneyProps = {
  currency: string;
  buckets: Bucket[];
  fromId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function MoveMoney({ currency, buckets, fromId, onSaved }: MoveMoneyProps) {
  const active = buckets.filter((bucket) => !bucket.archivedAt);
  const [from, setFrom] = useState(fromId ?? active[0]?.id ?? "");
  const [to, setTo] = useState(active.find((bucket) => bucket.id !== (fromId ?? active[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!from || !to || from === to) {
      setError("Choose two different buckets.");
      return;
    }
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
      const params = new URLSearchParams({ asOf: today() });
      const result = await apiRequest(`/api/buckets/${from}/events?${params.toString()}`, bucketEventSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "move",
          amount: minor,
          date,
          otherBucketId: to,
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
    <DialogForm onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>Move money</DialogTitle>
        <DialogDescription>Move money from one bucket to another. This does not move money between accounts.</DialogDescription>
      </DialogHeader>
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
        <Input id="move-date" type="date" value={date} required onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="move-note">Note</FieldLabel>
        <Input id="move-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving}>
          Move
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
