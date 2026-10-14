import { errorCode } from "@/api/client";
import { useSaveTag } from "@/api/tags";
import { useEditorFrame } from "@/editors/editor-api";
import { tagError } from "@/settings/format";
import { NameForm } from "@/settings/name-form";

type TagFormProps = {
  id: string | null;
  initialName: string;
  inline?: boolean;
  idPrefix?: string;
};

export function TagForm({ id, initialName, inline, idPrefix }: TagFormProps) {
  const { close } = useEditorFrame();
  const save = useSaveTag();
  return (
    <NameForm
      inline={inline}
      idPrefix={idPrefix}
      title={id ? "Rename tag" : "New tag"}
      description="Use a tag for a trip or a project."
      submitLabel={save.isPending ? "Saving tag" : id ? "Save tag" : "Add tag"}
      initialName={initialName}
      pending={save.isPending}
      error={save.error ? tagError(errorCode(save.error)) : null}
      onSubmit={(name) => save.mutate({ id, name }, { onSuccess: (saved) => close(saved.id) })}
    />
  );
}
