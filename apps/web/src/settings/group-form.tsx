import { useSaveGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useEditorFrame } from "@/editors/editor-api";
import { categoryError } from "@/settings/format";
import { NameForm } from "@/settings/name-form";

type GroupFormProps = {
  id: string | null;
  initialName: string;
  inline?: boolean;
  idPrefix?: string;
};

export function GroupForm({ id, initialName, inline, idPrefix }: GroupFormProps) {
  const { close } = useEditorFrame();
  const save = useSaveGroup();
  return (
    <NameForm
      inline={inline}
      idPrefix={idPrefix}
      title={id ? "Rename group" : "New group"}
      description="A group only organizes categories."
      submitLabel={save.isPending ? "Saving group" : id ? "Save group" : "Add group"}
      initialName={initialName}
      pending={save.isPending}
      error={save.error ? categoryError(errorCode(save.error)) : null}
      onSubmit={(name) => save.mutate({ id, name }, { onSuccess: (saved) => close(saved.id) })}
    />
  );
}
