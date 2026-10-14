import type { PlanKind } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { planQuery, useLinkOccurrence, useSkipOccurrence } from "@/api/recurring";
import { linkCandidatesQuery } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { planError } from "@/recurring/format";
import { PlanForm } from "@/recurring/plan-form";
import { formatDate } from "@/transactions/format";

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
  const skipOccurrence = useSkipOccurrence();
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: {
      onSubmit: ({ value }) => (value.reason.trim().length === 0 ? "Enter a reason." : undefined),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await skipOccurrence.mutateAsync({ planId, dueDate, reason: value.reason.trim() });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: planError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Skip this occurrence</DialogTitle>
          <DialogDescription>Tell why this one will not happen. You can restore it later.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="reason">{(field) => <field.TextField id="skip-reason" label="Reason" />}</form.AppField>
          <form.Subscribe selector={(state) => state.values.reason.trim().length === 0}>
            {(blank) => (blank ? <FieldError>Enter a reason.</FieldError> : <form.FormError />)}
          </form.Subscribe>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.Subscribe selector={(state) => state.values.reason.trim().length === 0}>
            {(blank) => <form.SubmitButton disabled={blank}>Skip</form.SubmitButton>}
          </form.Subscribe>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}

export function LinkOccurrenceEditor({ planId, accountId, dueDate }: EditorInput["linkOccurrence"]) {
  const { close } = useEditorFrame();
  const { data: candidates } = useSuspenseQuery(linkCandidatesQuery(accountId, dueDate));
  const linkOccurrence = useLinkOccurrence();
  const form = useAppForm({
    defaultValues: { transactionId: fieldValue<string | null>(null) },
    validators: {
      onSubmit: ({ value }) => (value.transactionId ? undefined : "Choose a transaction."),
    },
    onSubmit: async ({ value, formApi }) => {
      if (!value.transactionId) {
        return;
      }
      try {
        await linkOccurrence.mutateAsync({ planId, dueDate, transactionId: value.transactionId });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: planError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Link a transaction</DialogTitle>
          <DialogDescription>Choose a transaction on this account.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="transactionId">
            {(field) => (
              <field.ComboboxField
                id="link-transaction"
                label="Transaction"
                options={candidates.map((item) => ({ id: item.id, label: `${formatDate(item.date)} · ${item.payeeRaw}` }))}
                placeholder="Choose a transaction"
              />
            )}
          </form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.Subscribe selector={(state) => state.values.transactionId === null}>
            {(none) => <form.SubmitButton disabled={none}>Link</form.SubmitButton>}
          </form.Subscribe>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
