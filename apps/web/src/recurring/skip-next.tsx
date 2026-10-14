import type { Plan } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { occurrencesQuery, useSkipOccurrence } from "@/api/recurring";
import { planError } from "@/recurring/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type SkipNextProps = {
  plan: Plan;
  reason: string;
  asOf: string;
  onReason: (value: string) => void;
  onDone: () => void;
};

export function SkipNext({ plan, reason, asOf, onReason, onDone }: SkipNextProps) {
  const [nothingToSkip, setNothingToSkip] = useState(false);
  const occurrences = useQuery(occurrencesQuery(plan.id, asOf));
  const skip = useSkipOccurrence();
  const failure = occurrences.error ?? skip.error;
  const error = nothingToSkip ? "There is no occurrence to skip." : failure ? planError(errorCode(failure)) : null;
  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        if (!occurrences.data) {
          return;
        }
        const next = occurrences.data.items.find((item) => item.status === "missed" || item.status === "open");
        setNothingToSkip(!next);
        if (next) {
          skip.mutate({ planId: plan.id, dueDate: next.dueDate, reason: reason.trim() }, { onSuccess: onDone });
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Skip next</DialogTitle>
        <DialogDescription>Skip the next open or missed occurrence of {plan.name}.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field>
          <FieldLabel htmlFor="skip-next-reason">Reason</FieldLabel>
          <Input id="skip-next-reason" value={reason} onChange={(event) => onReason(event.target.value)} />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={skip.isPending || occurrences.isPending || reason.trim().length === 0}>
          Skip
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
