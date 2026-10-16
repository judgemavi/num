import { useSuspenseQuery } from "@tanstack/react-query";
import { bucketQuery } from "@/api/buckets";
import { errorCode } from "@/api/client";
import { useLinkOccurrence, useSkipOccurrence } from "@/api/schedules";
import { linkCandidatesQuery } from "@/api/transactions";
import { bucketError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { ScheduleForm } from "@/schedules/schedule-form";
import { formatDate } from "@/date-format";

export function CommitmentEditor({ id, seed }: EditorInput["commitment"]) {
  return id === null ? <ScheduleForm kind="commitment" draft={seed ?? "new"} /> : <SavedSchedule id={id} kind="commitment" />;
}

export function IncomeEditor({ id, seed }: EditorInput["income"]) {
  return id === null ? <ScheduleForm kind="income" draft={seed ?? "new"} /> : <SavedSchedule id={id} kind="income" />;
}

function SavedSchedule({ id, kind }: { id: string; kind: "commitment" | "income" }) {
  const { data: bucket } = useSuspenseQuery(bucketQuery(id));
  return <ScheduleForm kind={kind} draft={bucket} />;
}

export function SkipOccurrenceEditor({ bucketId, dueDate }: EditorInput["skipOccurrence"]) {
  const { close } = useEditorFrame();
  const skipOccurrence = useSkipOccurrence();
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: {
      onSubmit: ({ value }) => (value.reason.trim().length === 0 ? "Enter a reason." : undefined),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await skipOccurrence.mutateAsync({ bucketId, dueDate, reason: value.reason.trim() });
        close(bucketId);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: bucketError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Skip this occurrence</DialogTitle>
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

export function LinkOccurrenceEditor({ bucketId, accountId, dueDate }: EditorInput["linkOccurrence"]) {
  const { close } = useEditorFrame();
  const { data: candidates } = useSuspenseQuery(linkCandidatesQuery(accountId));
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
        await linkOccurrence.mutateAsync({ bucketId, dueDate, transactionId: value.transactionId });
        close(bucketId);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: bucketError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Link a transaction</DialogTitle>
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
