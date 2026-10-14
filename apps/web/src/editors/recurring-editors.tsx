import type { PlanKind } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { planQuery, useLinkOccurrence, useSkipOccurrence } from "@/api/recurring";
import { linkCandidatesQuery } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { planError } from "@/recurring/format";
import { PlanForm } from "@/recurring/plan-form";
import { formatDate } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";

export function PlanEditor({ id, seed, kind }: EditorInput["plan"]) {
  if (id === null) {
    return <PlanForm draft={seed ?? "new"} initialKind={kind} />;
  }
  return <SavedPlan id={id} initialKind={kind} />;
}

function SavedPlan({ id, initialKind }: { id: string; initialKind?: PlanKind }) {
  const { data: plan } = useSuspenseQuery(planQuery(id));
  return <PlanForm draft={plan} initialKind={initialKind} />;
}

export function SkipOccurrenceEditor({ planId, dueDate }: EditorInput["skipOccurrence"]) {
  const { close } = useEditorFrame();
  const [reason, setReason] = useState("");
  const skipOccurrence = useSkipOccurrence();

  function skip() {
    if (reason.trim().length === 0) {
      return;
    }
    skipOccurrence.mutate({ planId, dueDate, reason: reason.trim() }, { onSuccess: () => close("ok") });
  }

  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        skip();
      }}
    >
      <DialogHeader>
        <DialogTitle>Skip this occurrence</DialogTitle>
        <DialogDescription>Tell why this one will not happen. You can restore it later.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field>
          <FieldLabel htmlFor="skip-reason">Reason</FieldLabel>
          <Input id="skip-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {reason.trim().length === 0 ? <FieldError>Enter a reason.</FieldError> : null}
        {skipOccurrence.error ? <FieldError>{planError(errorCode(skipOccurrence.error))}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={reason.trim().length === 0 || skipOccurrence.isPending}>
          Skip
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}

export function LinkOccurrenceEditor({ planId, accountId, dueDate }: EditorInput["linkOccurrence"]) {
  const { close } = useEditorFrame();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const { data: candidates } = useSuspenseQuery(linkCandidatesQuery(accountId, dueDate));
  const linkOccurrence = useLinkOccurrence();

  function link() {
    if (!transactionId) {
      return;
    }
    linkOccurrence.mutate({ planId, dueDate, transactionId }, { onSuccess: () => close("ok") });
  }

  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        link();
      }}
    >
      <DialogHeader>
        <DialogTitle>Link a transaction</DialogTitle>
        <DialogDescription>Choose a transaction on this account.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field>
          <FieldLabel htmlFor="link-transaction">Transaction</FieldLabel>
          <OptionCombobox
            id="link-transaction"
            value={transactionId}
            options={candidates.map((item) => ({
              id: item.id,
              label: `${formatDate(item.date)} · ${item.payeeRaw}`,
            }))}
            placeholder="Choose a transaction"
            onChange={setTransactionId}
          />
        </Field>
        {linkOccurrence.error ? <FieldError>{planError(errorCode(linkOccurrence.error))}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!transactionId || linkOccurrence.isPending}>
          Link
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
