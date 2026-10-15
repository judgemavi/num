import type { Merchant } from "@num/shared";
import { errorCode } from "@/api/client";
import { useMergeMerchant } from "@/api/merchants";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { useMerchants } from "@/editors/lookups";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { merchantError } from "@/settings/format";

export function MergeDialog({ source }: { source: Merchant }) {
  const { close } = useEditorFrame();
  const merchants = useMerchants();
  const merge = useMergeMerchant();
  const options = merchants.filter((merchant) => merchant.id !== source.id && merchant.archivedAt === null);
  const form = useAppForm({
    defaultValues: { targetId: fieldValue<string | null>(null) },
    validators: {
      onSubmit: ({ value }) => (value.targetId ? undefined : "Choose the merchant that remains."),
    },
    onSubmit: async ({ value, formApi }) => {
      if (!value.targetId) {
        return;
      }
      try {
        await merge.mutateAsync({ id: source.id, targetId: value.targetId });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: merchantError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Merge this merchant?</DialogTitle>
          <DialogDescription>
            Move transactions, bills and incomes from {source.name} to the merchant you choose. {source.name} is then archived.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="targetId">
            {(field) => (
              <field.ComboboxField
                id="merge-target"
                label="Merchant that remains"
                options={options.map((merchant) => ({ id: merchant.id, label: merchant.name }))}
                placeholder="Choose a merchant"
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
          <form.SubmitButton saving="Merging">Merge</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
