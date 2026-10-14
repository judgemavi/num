import { bucketWriteSchema, categoryUpdateSchema, type Category, type CategoryKind } from "@num/shared";
import { useUpdateBucket } from "@/api/buckets";
import { useSaveCategory } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useActiveBuckets, useGroups } from "@/editors/lookups";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, FormActions, FormCancel, FormHeading } from "@/editors/form-chrome";
import { ManagedPicker } from "@/editors/managed-picker";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
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
  const buckets = useActiveBuckets();
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
      essential: category?.essential ?? false,
      /** A new expense category can go in a bucket. */
      bucketId: fieldValue<string | null>(null),
    },
    validators: {
      onSubmit: ({ value }) => (categoryUpdateSchema.safeParse(value).success ? undefined : "Check the fields."),
    },
    onSubmit: async ({ value, formApi }) => {
      let saved;
      try {
        saved = await save.mutateAsync({
          id: category?.id ?? null,
          body: { name: value.name.trim(), kind: value.kind, groupId: value.groupId, essential: value.essential },
        });
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: categoryError(errorCode(error)), fields: {} } });
        return;
      }
      const bucket = category || value.kind !== "expense" ? undefined : buckets.items.find((item) => item.id === value.bucketId);
      const body = bucket ? bucketWriteSchema.safeParse({ ...bucket, categoryIds: [...bucket.categoryIds, saved.id] }) : undefined;
      if (bucket && body?.success) {
        try {
          await addToBucket.mutateAsync({ id: bucket.id, body: body.data });
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
        description={
          category ? "Change the name, the kind, the group, or whether it is essential." : "Add a category for income or expenses."
        }
      />
      <form.FormShell inline={inline} className={inline ? "flex flex-col gap-4" : undefined}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
          <form.AppField name="name">{(field) => <field.TextField id={`${fieldId}-name`} label="Name" autoComplete="off" />}</form.AppField>
          <form.AppField
            name="kind"
            listeners={{
              // An income category is never essential.
              onChange: ({ value, fieldApi }) => {
                if (value === "income") {
                  fieldApi.form.setFieldValue("essential", false);
                }
              },
            }}
          >
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
          <form.Subscribe selector={(state) => state.values.kind === "expense"}>
            {(expense) =>
              expense ? (
                <>
                  {category ? null : (
                    <form.AppField name="bucketId">
                      {(field) => (
                        <field.ComboboxField
                          id={`${fieldId}-bucket`}
                          label="Add to a bucket"
                          options={buckets.items.map((bucket) => ({ id: bucket.id, label: bucket.name }))}
                          placeholder="No bucket"
                          emptyLabel="No bucket"
                        />
                      )}
                    </form.AppField>
                  )}
                  <form.AppField name="essential">
                    {(field) => (
                      <field.CheckboxField
                        id={`${fieldId}-essential`}
                        label="Essential"
                        description="A cost you must pay. The emergency fund check uses this flag."
                      />
                    )}
                  </form.AppField>
                </>
              ) : null
            }
          </form.Subscribe>
          <form.FormError />
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel>Cancel</FormCancel>
          <form.SubmitButton inline={inline} saving="Saving category">
            Save category
          </form.SubmitButton>
        </FormActions>
      </form.FormShell>
    </form.AppForm>
  );
}
