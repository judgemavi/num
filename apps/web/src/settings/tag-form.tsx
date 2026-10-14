import { tagCreateSchema } from "@num/shared";
import { errorCode } from "@/api/client";
import { useSaveTag } from "@/api/tags";
import { useEditorFrame } from "@/editors/editor-api";
import { useAppForm } from "@/forms/form-hook";
import { tagError } from "@/settings/format";
import { NameFields } from "@/settings/name-form";

export function TagForm({ id, initialName, inline = false, idPrefix = "record-name" }: { id: string | null; initialName: string; inline?: boolean; idPrefix?: string }) {
  const { close } = useEditorFrame();
  const save = useSaveTag();
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: {
      onSubmit: tagCreateSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        close((await save.mutateAsync({ id, name: value.name.trim() })).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: tagError(errorCode(error)), fields: {} } });
      }
    },
  });
  return (
    <NameFields
      form={form}
      inline={inline}
      idPrefix={idPrefix}
      title={id ? "Rename tag" : "New tag"}
      description="Use a tag for a trip or a project."
      submitLabel={id ? "Save tag" : "Add tag"}
      saving="Saving tag"
    />
  );
}
