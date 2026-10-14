import {
  bucketWriteSchema,
  categoryUpdateSchema,
  type Category,
  type CategoryKind,
} from "@num/shared";
import { useState } from "react";
import { useUpdateBucket } from "@/api/buckets";
import { useSaveCategory } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useActiveBuckets, useGroups } from "@/editors/lookups";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { ManagedPicker } from "@/editors/managed-picker";
import { categoryError } from "@/settings/format";
import { GroupForm } from "@/settings/group-form";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceSelect } from "@/components/choice-select";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const noGroup = "none";

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
  const [name, setName] = useState(category?.name ?? initialName ?? "");
  const [kind, setKind] = useState(category?.kind ?? initialKind ?? "expense");
  const [groupId, setGroupId] = useState(category?.groupId ?? noGroup);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const save = useSaveCategory();
  const addToBucket = useUpdateBucket();
  const pending = save.isPending || addToBucket.isPending;
  const fieldId = inline ? `category-${depth}` : "category";
  const expense = kind === "expense";
  const groupOptions = groups.map((group) => ({ id: group.id, label: group.name }));

  function errorText() {
    if (invalid) {
      return "Check the fields.";
    }
    if (addToBucket.isError) {
      return "The category was saved. The bucket did not update.";
    }
    return save.error ? categoryError(errorCode(save.error)) : null;
  }

  function addCategoryToBucket(categoryId: string) {
    const bucket = category || !bucketId ? undefined : buckets.items.find((item) => item.id === bucketId);
    const body = bucket ? bucketWriteSchema.safeParse({ ...bucket, categoryIds: [...bucket.categoryIds, categoryId] }) : undefined;
    if (!bucket || !body?.success) {
      close(categoryId);
      return;
    }
    addToBucket.mutate({ id: bucket.id, body: body.data }, { onSettled: () => close(categoryId) });
  }

  function submit() {
    const parsed = categoryUpdateSchema.safeParse({
      name,
      kind,
      groupId: groupId === noGroup ? null : groupId,
      essential: expense ? essential : false,
    });
    setInvalid(!parsed.success);
    if (parsed.success) {
      save.mutate({ id: category?.id ?? null, body: parsed.data }, { onSuccess: (saved) => addCategoryToBucket(saved.id) });
    }
  }

  const error = errorText();

  return (
    <>
      <FormHeading
        inline={inline}
        title={category ? "Edit category" : "New category"}
        description={
          category ? "Change the name, the kind, the group, or whether it is essential." : "Add a category for income or expenses."
        }
      />
      <FormShell inline={inline} className="flex flex-col gap-4" onSubmit={submit}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-name`}>Name</FieldLabel>
          <Input id={`${fieldId}-name`} value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-kind`}>Kind</FieldLabel>
          <ChoiceSelect
            id={`${fieldId}-kind`} className="w-full"
            value={kind}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
            onValueChange={(next) => {
              setKind(next);
              if (next === "income") {
                setEssential(false);
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-group`}>Group</FieldLabel>
          <ManagedPicker
            id={`${fieldId}-group`}
            value={groupId === noGroup ? null : groupId}
            options={groupOptions}
            placeholder="No group"
            emptyLabel="No group"
            noun="group"
            depth={depth}
            onChange={(id) => setGroupId(id ?? noGroup)}
            renderForm={(typed) => <GroupForm inline id={null} idPrefix={`${fieldId}-group-name`} initialName={typed} />}
          />
        </Field>
        {!category && expense ? (
          <Field>
            <FieldLabel htmlFor={`${fieldId}-bucket`}>Add to a bucket</FieldLabel>
            <OptionCombobox
              id={`${fieldId}-bucket`}
              value={bucketId}
              options={buckets.items.map((bucket) => ({ id: bucket.id, label: bucket.name }))}
              placeholder="No bucket"
              emptyLabel="No bucket"
              onChange={setBucketId}
            />
          </Field>
        ) : null}
        {expense ? (
          <Field orientation="horizontal">
            <Checkbox
              id={`${fieldId}-essential`}
              checked={essential}
              onCheckedChange={(checked) => setEssential(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${fieldId}-essential`}>Essential</FieldLabel>
              <FieldDescription>A cost you must pay. The emergency fund check uses this flag.</FieldDescription>
            </FieldContent>
          </Field>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel>Cancel</FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={pending} onClick={inline ? submit : undefined}>
            {pending ? "Saving category" : "Save category"}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
