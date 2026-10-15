import { categoryCreateSchema, hasSchedule, type Category, type CategoryKind } from "@num/shared";
import { useUpdateBucket } from "@/api/buckets";
import { useSaveCategory } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useActiveBuckets, useGroups } from "@/editors/lookups";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, FormActions, FormCancel, FormHeading } from "@/editors/form-chrome";
import { ManagedPicker } from "@/editors/managed-picker";
import { useAppForm } from "@/forms/form-hook";
import { editPatch, fieldValue } from "@/forms/form-values";
import { categoryError } from "@/settings/format";
import { GroupForm } from "@/settings/group-form";
import { Field, FieldLabel } from "@/components/ui/field";

const kindOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

type CategoryFormProps = {
  category: Category | null;
  initialName?: string;
  initialKind?: CategoryKind;
  inline?: boolean;
  depth?: number;
};

export function CategoryForm({ category, initialName, initialKind, inline = false, depth = 0 }: CategoryFormProps) {
  const { close } = useEditorFrame();
  // A commitment and an income have no categories.
  const buckets = useActiveBuckets().items.filter((item) => !hasSchedule(item.kind));
  const groups = useGroups();
  const save = useSaveCategory();
  const addToBucket = useUpdateBucket();
  const fieldId = inline ? `category-${depth}` : "category";
  const groupOptions = groups.map((group) => ({ id: group.id, label: group.name }));

  const form = useAppForm({
    defaultValues: {
      name: category?.name ?? initialName ?? "",
      kind: category?.kind ?? initialKind ?? "expense",
      groupId: category?.groupId ?? null,
      /** A new expense category can go in a bucket. */
      bucketId: fieldValue<string | null>(null),
    },
    validators: {
      onSubmit: ({ value }) => (categoryCreateSchema.safeParse(value).success ? undefined : "Check the fields."),
    },
    onSubmit: async ({ value, formApi }) => {
      const body = { name: value.name.trim(), kind: value.kind, groupId: value.groupId };
      const start = category ? { name: category.name, kind: category.kind, groupId: category.groupId } : null;
      const patch = start ? editPatch(body, start) : null;
      const request = category ? (patch ? { id: category.id, body: patch } : null) : { id: null, body };
      // An edit with no change closes without a write.
      if (!request) {
        close();
        return;
      }
      let saved;
      try {
        saved = await save.mutateAsync(request);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: categoryError(errorCode(error)), fields: {} } });
        return;
      }
      const bucket = category || value.kind !== "expense" ? undefined : buckets.find((item) => item.id === value.bucketId);
      if (bucket) {
        try {
          await addToBucket.mutateAsync({ id: bucket.id, body: { categoryIds: [...bucket.categoryIds, saved.id] } });
        } catch {
          // The category is in the book. The person can add it to the bucket on the Buckets screen.
        }
      }
      close(saved.id);
    },
  });

  return (
    <form.AppForm>
      <FormHeading
        inline={inline}
        title={category ? "Edit category" : "New category"}
      />
      <form.FormShell inline={inline} className={inline ? "flex flex-col gap-4" : undefined}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
          <form.AppField name="name">{(field) => <field.TextField id={`${fieldId}-name`} label="Name" autoComplete="off" />}</form.AppField>
          <form.AppField name="kind">
            {(field) => <field.SelectField id={`${fieldId}-kind`} label="Kind" options={kindOptions} />}
          </form.AppField>
          <form.Field name="groupId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`${fieldId}-group`}>Group</FieldLabel>
                <ManagedPicker
                  id={`${fieldId}-group`}
                  value={field.state.value}
                  options={groupOptions}
                  placeholder="No group"
                  emptyLabel="No group"
                  noun="group"
                  depth={depth}
                  onChange={field.handleChange}
                  renderForm={(typed) => <GroupForm inline id={null} idPrefix={`${fieldId}-group-name`} initialName={typed} />}
                />
              </Field>
            )}
          </form.Field>
          {category ? null : (
            <form.Subscribe selector={(state) => state.values.kind === "expense"}>
              {(expense) =>
                expense ? (
                  <form.AppField name="bucketId">
                    {(field) => (
                      <field.ComboboxField
                        id={`${fieldId}-bucket`}
                        label="Add to a bucket"
                        options={buckets.map((bucket) => ({ id: bucket.id, label: bucket.name }))}
                        placeholder="No bucket"
                        emptyLabel="No bucket"
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>
          )}
          <form.FormError />
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel>Cancel</FormCancel>
          <form.SubmitButton inline={inline} saving="Saving category">
            Save
          </form.SubmitButton>
        </FormActions>
      </form.FormShell>
    </form.AppForm>
  );
}
