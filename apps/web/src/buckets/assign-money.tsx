import type { Bucket, BucketEventKind } from "@num/shared";
import { useAddBucketEvent } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { moveAmount, requestError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { useBookCurrency } from "@/editors/lookups";

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
  const save = useAddBucketEvent();
  const labels = copy[kind];
  const form = useAppForm({
    defaultValues: { amount: "", date: localAsOf(), note: "" },
    validators: {
      onSubmit: ({ value }) => {
        const amount = moveAmount(currency, value.amount);
        return "error" in amount ? amount.error : undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const amount = moveAmount(currency, value.amount);
      if ("error" in amount) {
        return;
      }
      try {
        await save.mutateAsync({
          bucketId: bucket.id,
          asOf: localAsOf(),
          body: { kind, amount: amount.milli, date: value.date, note: value.note.trim() === "" ? null : value.note.trim() },
        });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "The money did not move. Try again."), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {bucket.name}. {labels.text}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="amount">{(field) => <field.MoneyField id="assign-amount" label="Amount" required />}</form.AppField>
          <form.AppField name="date">{(field) => <field.DateInputField id="assign-date" label="Date" required />}</form.AppField>
          <form.AppField name="note">{(field) => <field.TextField id="assign-note" label="Note" />}</form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton>{labels.action}</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
