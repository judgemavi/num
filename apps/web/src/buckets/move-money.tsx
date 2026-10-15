import { useAddBucketEvent } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { moveAmount, requestError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { useActiveBuckets, useBookCurrency } from "@/editors/lookups";

/** Move money from one active bucket to another. `fromId` is the bucket that the person started from. */
export function MoveMoney({ fromId }: EditorInput["moveMoney"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  // An income holds no money.
  const active = useActiveBuckets().items.filter((bucket) => bucket.kind !== "income");
  const save = useAddBucketEvent();
  const startFrom = fromId ?? active[0]?.id ?? "";
  const form = useAppForm({
    defaultValues: { from: startFrom, to: active.find((bucket) => bucket.id !== startFrom)?.id ?? "", amount: "", date: localAsOf() },
    validators: {
      onSubmit: ({ value }) => {
        if (!value.from || !value.to || value.from === value.to) {
          return "Choose two different buckets.";
        }
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
          bucketId: value.from,
          asOf: localAsOf(),
          body: { kind: "move", amount: amount.milli, date: value.date, otherBucketId: value.to },
        });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "The money did not move. Try again."), fields: {} } });
      }
    },
  });
  const options = active.map((bucket) => ({ value: bucket.id, label: bucket.name }));

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Move money</DialogTitle>
          <DialogDescription>This does not move money between accounts.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="from">
            {(field) => <field.SelectField id="move-from" label="From" options={options} placeholder="Choose a bucket" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.from}>
            {(from) => (
              <form.AppField name="to">
                {(field) => (
                  <field.SelectField id="move-to" label="To" options={options.filter((option) => option.value !== from)} placeholder="Choose a bucket" />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="amount">{(field) => <field.MoneyField id="move-amount" label="Amount" required />}</form.AppField>
          <form.AppField name="date">{(field) => <field.DateInputField id="move-date" label="Date" required />}</form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton>Move</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
