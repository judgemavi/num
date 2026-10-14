import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { planQuery, useLinkOccurrence, useSkipOccurrence } from "@/api/recurring";
import { linkCandidatesQuery } from "@/api/transactions";
import { useState } from "react";
import { importCountText, unreadableLabel } from "@/accounts/import-format";
import type { EditorInput } from "@/editors/editor-types";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { planError } from "@/recurring/format";
import { formatDate } from "@/transactions/format";
import { SkipNext } from "@/recurring/skip-next";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm, DialogPanel } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Finish = { onClose: () => void; onSaved: (id: string) => void };

export function ImportInfoEditor({ props }: { props: EditorInput["importInfo"] }) {
  return (
    <DialogPanel>
      <DialogHeader>
        <DialogTitle>Import detail</DialogTitle>
        <DialogDescription>
          {props.filename ?? "Statement"} · {importCountText(props.counts)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
      {props.unreadable.length > 0 ? (
        <ul className="grid gap-3">
          {props.unreadable.map((row) => (
            <li key={`${row.line}-${row.raw}`} className="grid gap-1 border-t pt-3 text-sm">
              <p className="font-semibold">
                Line {row.line}. {unreadableLabel(row.reason)}
              </p>
              <p className="break-all text-muted-foreground">{row.raw}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Every row was read.</p>
      )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogPanel>
  );
}

export function SkipNextEditor({ props, onSaved }: { props: EditorInput["skipNext"]; onSaved: (id: string) => void }) {
  const [reason, setReason] = useState("");
  const plan = useQuery(planQuery(props.planId));
  if (plan.isPending) {
    return <LoadingLine label="Loading recurring." />;
  }
  if (plan.isError || !plan.data) {
    return <LoadError label="Recurring did not load." onRetry={() => void plan.refetch()} />;
  }
  return <SkipNext plan={plan.data} reason={reason} asOf={props.asOf} onReason={setReason} onDone={() => onSaved("ok")} />;
}

export function SkipOccurrenceEditor({ props, onSaved }: { props: EditorInput["skipOccurrence"]; onSaved: (id: string) => void }) {
  const [reason, setReason] = useState("");
  const skipOccurrence = useSkipOccurrence();

  function skip() {
    if (reason.trim().length === 0) {
      return;
    }
    skipOccurrence.mutate({ planId: props.planId, dueDate: props.dueDate, reason: reason.trim() }, { onSuccess: () => onSaved("ok") });
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

export function LinkOccurrenceEditor({ props, onSaved }: { props: EditorInput["linkOccurrence"] } & Finish) {
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const candidates = useQuery(linkCandidatesQuery(props.accountId, props.dueDate));
  const linkOccurrence = useLinkOccurrence();

  function link() {
    if (!transactionId) {
      return;
    }
    linkOccurrence.mutate({ planId: props.planId, dueDate: props.dueDate, transactionId }, { onSuccess: () => onSaved("ok") });
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
          options={(candidates.data ?? []).map((item) => ({
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

