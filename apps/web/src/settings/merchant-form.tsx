import { DecisionNotes } from "@/review/decision-notes";
import { merchantCreateSchema, type Merchant } from "@num/shared";
import { errorCode } from "@/api/client";
import { useSaveMerchant } from "@/api/merchants";
import { useEditorFrame } from "@/editors/editor-api";
import { useAppForm } from "@/forms/form-hook";
import { merchantError } from "@/settings/format";
import { NameFields } from "@/settings/name-form";

type MerchantFormProps = {
  merchant: Merchant | null;
  initialName?: string;
  inline?: boolean;
  depth?: number;
};

export function MerchantForm({ merchant, initialName, inline = false, depth = 0 }: MerchantFormProps) {
  const { close } = useEditorFrame();
  const save = useSaveMerchant();
  const form = useAppForm({
    defaultValues: { name: merchant?.name ?? initialName ?? "" },
    validators: {
      onSubmit: merchantCreateSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      // An edit with no change closes without a write.
      if (merchant && formApi.state.isDefaultValue) {
        close();
        return;
      }
      try {
        close((await save.mutateAsync({ id: merchant?.id ?? null, name: value.name.trim() })).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: merchantError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <NameFields
      form={form}
      inline={inline}
      idPrefix={inline ? `merchant-${depth}-name` : "merchant-name"}
      title={merchant ? "Edit merchant" : "New merchant"}
      submitLabel={merchant ? "Save" : "Add"}
      saving="Saving"
    >
      {merchant ? <DecisionNotes merchantId={merchant.id} /> : null}
    </NameFields>
  );
}
