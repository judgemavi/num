import {
  bucketWriteSchema,
  categoryKinds,
  categoryUpdateSchema,
  type Category,
  type CategoryGroup,
  type CategoryKind,
} from "@num/shared";
import { useState } from "react";
import { useUpdateBucket } from "@/api/buckets";
import { useSaveCategory, useSaveGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useActiveBuckets } from "@/editors/lookups";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { ManagedPicker } from "@/editors/managed-picker";
import { categoryError } from "@/settings/format";
import { NameForm } from "@/settings/name-form";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const noGroup = "none";

type CategoryFormProps = {
  category: Category | null;
  groups: CategoryGroup[];
  initialName?: string;
  initialKind?: CategoryKind;
  inline?: boolean;
  depth?: number;
  onClose: () => void;
  onSaved: (id: string) => void;
};

function isKind(value: string): value is CategoryKind {
  return (categoryKinds as readonly string[]).includes(value);
}

export function CategoryForm({ category, groups, initialName, initialKind, inline = false, depth = 0, onClose, onSaved }: CategoryFormProps) {
  const buckets = useActiveBuckets();
  const [name, setName] = useState(category?.name ?? initialName ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? initialKind ?? "expense");
  const [groupId, setGroupId] = useState(category?.groupId ?? noGroup);
  const [extraGroups, setExtraGroups] = useState<CategoryGroup[]>([]);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const save = useSaveCategory();
  const saveGroup = useSaveGroup();
  const addToBucket = useUpdateBucket();
  const pending = save.isPending || addToBucket.isPending;
  const fieldId = inline ? `category-${depth}` : "category";
  const expense = kind === "expense";
  const groupOptions = [...groups, ...extraGroups.filter((group) => !groups.some((item) => item.id === group.id))].map((group) => ({
    id: group.id,
    label: group.name,
  }));

  function errorText(): string | null {
    if (invalid) {
      return "Check the fields.";
    }
    if (addToBucket.isError) {
      return "The category was saved. The bucket did not update.";
    }
    return save.error ? categoryError(errorCode(save.error)) : null;
  }

  function addCategoryToBucket(categoryId: string) {
    const bucket = category || !bucketId ? undefined : buckets.data?.items.find((item) => item.id === bucketId);
    const body = bucket ? bucketWriteSchema.safeParse({ ...bucket, categoryIds: [...bucket.categoryIds, categoryId] }) : undefined;
    if (!bucket || !body?.success) {
      onSaved(categoryId);
      return;
    }
    addToBucket.mutate({ id: bucket.id, body: body.data }, { onSettled: () => onSaved(categoryId) });
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
          <Select
            value={kind}
            onValueChange={(value) => {
              if (!isKind(value)) {
                return;
              }
              setKind(value);
              if (value === "income") {
                setEssential(false);
              }
            }}
          >
            <SelectTrigger id={`${fieldId}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
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
            renderForm={(typed, finish) => (
              <NameForm
                inline
                idPrefix={`${fieldId}-group-name`}
                title="New group"
                description="A group only organizes categories."
                label="Name"
                submitLabel="Add group"
                savingLabel="Saving group"
                initialName={typed}
                pending={saveGroup.isPending}
                error={saveGroup.error ? categoryError(errorCode(saveGroup.error)) : null}
                onClose={() => finish(null)}
                onSubmit={(groupName) =>
                  saveGroup.mutate(
                    { id: null, name: groupName },
                    {
                      onSuccess: (group) => {
                        setExtraGroups((current) => [...current, group]);
                        finish(group.id);
                      },
                    },
                  )
                }
              />
            )}
          />
        </Field>
        {!category && expense ? (
          <Field>
            <FieldLabel htmlFor={`${fieldId}-bucket`}>Add to a bucket</FieldLabel>
            <OptionCombobox
              id={`${fieldId}-bucket`}
              value={bucketId}
              options={(buckets.data?.items ?? []).map((bucket) => ({ id: bucket.id, label: bucket.name }))}
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
          <FormCancel inline={inline} onClose={onClose}>
            Cancel
          </FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={pending} onClick={inline ? submit : undefined}>
            {pending ? "Saving category" : "Save category"}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
