import { categoryGroupCreateSchema, nextIdentityColor, type CategoryGroup } from "@num/shared";
import { useSaveGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { ColorPicker } from "@/components/color-picker";
import { useEditorFrame } from "@/editors/editor-api";
import { useGroups } from "@/editors/lookups";
import { DialogBody, FormActions, FormCancel, FormHeading } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { editPatch } from "@/forms/form-values";
import { categoryError } from "@/settings/format";

export function GroupForm({ group, initialName = "", inline = false, idPrefix = "record-name" }: { group: CategoryGroup | null; initialName?: string; inline?: boolean; idPrefix?: string }) {
  const { close } = useEditorFrame();
  const groups = useGroups();
  const save = useSaveGroup();
  const start = { name: group?.name ?? initialName, color: group?.color ?? nextIdentityColor(groups.length) };
  const form = useAppForm({
    defaultValues: start,
    validators: {
      onSubmit: categoryGroupCreateSchema.required({ color: true }),
    },
    onSubmit: async ({ value, formApi }) => {
      const body = { name: value.name.trim(), color: value.color };
      const patch = group ? editPatch(body, { name: group.name, color: group.color }) : null;
      const request = group ? (patch ? { id: group.id, body: patch } : null) : { id: null, body };
      if (!request) {
        close();
        return;
      }
      try {
        close((await save.mutateAsync(request)).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: categoryError(errorCode(error)), fields: {} } });
      }
    },
  });
  return (
    <form.AppForm>
      <FormHeading inline={inline} title={group ? "Edit group" : "New group"} />
      <form.FormShell inline={inline} className={inline ? "flex flex-col gap-4" : undefined}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
          <form.AppField name="name">{(field) => <field.TextField id={idPrefix} label="Name" autoComplete="off" />}</form.AppField>
          <form.Field name="color">{(field) => <ColorPicker value={field.state.value} onChange={field.handleChange} suggest={group === null} />}</form.Field>
          <form.FormError invalid="Check the fields." />
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel>Cancel</FormCancel>
          <form.SubmitButton inline={inline} saving="Saving group">{group ? "Save" : "Add"}</form.SubmitButton>
        </FormActions>
      </form.FormShell>
    </form.AppForm>
  );
}
