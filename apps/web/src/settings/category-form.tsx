import {
  bucketSchema,
  bucketWriteSchema,
  categoryCreateSchema,
  categoryKinds,
  categorySchema,
  categoryGroupSchema,
  categoryUpdateSchema,
  type Category,
  type CategoryGroup,
  type CategoryKind,
} from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveBuckets } from "@/editors/lookups";
import { FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { ManagedPicker } from "@/editors/managed-picker";
import { categoryError } from "@/settings/format";
import { NameForm } from "@/settings/name-form";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
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
  const queryClient = useQueryClient();
  const buckets = useActiveBuckets();
  const [name, setName] = useState(category?.name ?? initialName ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? initialKind ?? "expense");
  const [groupId, setGroupId] = useState(category?.groupId ?? noGroup);
  const [extraGroups, setExtraGroups] = useState<CategoryGroup[]>([]);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldId = inline ? `category-${depth}` : "category";
  const expense = kind === "expense";
  const groupOptions = [...groups, ...extraGroups.filter((group) => !groups.some((item) => item.id === group.id))].map((group) => ({
    id: group.id,
    label: group.name,
  }));

  async function submit() {
    const body = {
      name,
      kind,
      groupId: groupId === noGroup ? null : groupId,
      essential: expense ? essential : false,
    };
    const parsed = (category ? categoryUpdateSchema : categoryCreateSchema).safeParse(body);
    if (!parsed.success) {
      setError("Check the fields.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest(category ? `/api/categories/${category.id}` : "/api/categories", categorySchema, {
        method: category ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!result.ok) {
        setError(categoryError(result.code));
        return;
      }
      if (!category && bucketId) {
        const bucket = buckets.data?.items.find((item) => item.id === bucketId);
        if (bucket) {
          const body = bucketWriteSchema.safeParse({ ...bucket, categoryIds: [...bucket.categoryIds, result.data.id] });
          if (body.success) {
            const added = await apiRequest(`/api/buckets/${bucket.id}`, bucketSchema, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body.data),
            });
            if (!added.ok) {
              setError("The category was saved. The bucket did not update.");
              onSaved(result.data.id);
              return;
            }
          }
        }
      }
      onSaved(result.data.id);
    } catch {
      setError("The change did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FormHeading
        inline={inline}
        title={category ? "Edit category" : "New category"}
        description={
          category ? "Change the name, the kind, the group, or whether it is essential." : "Add a category for income or expenses."
        }
      />
      <FormShell inline={inline} className="flex flex-col gap-4" onSubmit={() => void submit()}>
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
            renderForm={(typed, finish) => {
              let createdGroup: string | null = null;
              return (
              <NameForm
                inline
                idPrefix={`${fieldId}-group-name`}
                title="New group"
                description="A group only organizes categories."
                label="Name"
                submitLabel="Add group"
                savingLabel="Saving group"
                initialName={typed}
                onClose={() => finish(createdGroup)}
                onSubmit={async (groupName) => {
                  const result = await apiRequest("/api/category-groups", categoryGroupSchema, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name: groupName }),
                  });
                  if (!result.ok) {
                    return categoryError(result.code);
                  }
                  createdGroup = result.data.id;
                  setExtraGroups((current) => [...current, { id: result.data.id, name: groupName }]);
                  await queryClient.invalidateQueries({ queryKey: ["category-groups"] });
                  return null;
                }}
              />
              );
            }}
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
        <FormActions inline={inline}>
          <FormCancel inline={inline} onClose={onClose}>
            Cancel
          </FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={saving} onClick={inline ? () => void submit() : undefined}>
            {saving ? "Saving category" : "Save category"}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
