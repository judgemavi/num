import { useSuspenseQueries } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { occurrencesQuery, planQuery, useSkipOccurrence } from "@/api/recurring";
import { localAsOf } from "@/as-of";
import { planError } from "@/recurring/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SkipNext({ planId }: EditorInput["skipNext"]) {
  const { close } = useEditorFrame();
  const [reason, setReason] = useState("");
  const [nothingToSkip, setNothingToSkip] = useState(false);
  const [{ data: plan }, { data: occurrences }] = useSuspenseQueries({ queries: [planQuery(planId), occurrencesQuery(planId, localAsOf())] });
  const skip = useSkipOccurrence();
  const error = nothingToSkip ? "There is no occurrence to skip." : skip.error ? planError(errorCode(skip.error)) : null;
  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        const next = occurrences.items.find((item) => item.status === "missed" || item.status === "open");
        setNothingToSkip(!next);
        if (next) {
          skip.mutate({ planId, dueDate: next.dueDate, reason: reason.trim() }, { onSuccess: () => close("ok") });
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
          <Input id="skip-next-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={skip.isPending || reason.trim().length === 0}>
          Skip
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
