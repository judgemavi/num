import { merchantCreateSchema, type Merchant } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { useSaveMerchant } from "@/api/merchants";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { useEditorFrame } from "@/editors/editor-api";
import { useAppForm } from "@/forms/form-hook";
import { decisionText } from "@/review/format";
import { Button } from "@/components/ui/button";
import { merchantError } from "@/settings/format";
import { NameFields } from "@/settings/name-form";

type MerchantFormProps = {
  merchant: Merchant | null;
  initialName?: string;
  inline?: boolean;
  depth?: number;
};

/** The "not recurring" answers that the person gave for a merchant. Each answer has an Undo button. */
function NotRecurringNotes({ merchantId }: { merchantId: string }) {
  const undo = useUndoDecision();
  const { data: decisions } = useSuspenseQuery({
    ...inboxDecisionsQuery(),
    select: (rows) => rows.filter((row) => row.decision === "not_recurring" && row.itemKey.includes(`:${merchantId}:`)),
  });
  return (
    <>
      {decisions.map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{decisionText(row.decision)}</span>
          <Button type="button" variant="outline" onClick={() => undo.mutate(row.itemKey)}>
            Undo
          </Button>
        </p>
      ))}
    </>
  );
}

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
      description="A merchant groups the transactions of one business."
      submitLabel={merchant ? "Save" : "Add"}
      saving="Saving"
    >
      {merchant ? <NotRecurringNotes merchantId={merchant.id} /> : null}
    </NameFields>
  );
}
