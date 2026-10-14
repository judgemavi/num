import { categoryGroupCreateSchema } from "@num/shared";
import { useSaveGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useEditorFrame } from "@/editors/editor-api";
import { useAppForm } from "@/forms/form-hook";
import { categoryError } from "@/settings/format";
import { NameFields } from "@/settings/name-form";

export function GroupForm({ id, initialName, inline = false, idPrefix = "record-name" }: { id: string | null; initialName: string; inline?: boolean; idPrefix?: string }) {
  const { close } = useEditorFrame();
  const save = useSaveGroup();
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: {
      onSubmit: categoryGroupCreateSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        close((await save.mutateAsync({ id, name: value.name.trim() })).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: categoryError(errorCode(error)), fields: {} } });
      }
    },
  });
  return (
    <NameFields
      form={form}
      inline={inline}
      idPrefix={idPrefix}
      title={id ? "Rename group" : "New group"}
      description="A group only organizes categories."
      submitLabel={id ? "Save group" : "Add group"}
      saving="Saving group"
    />
  );
}
