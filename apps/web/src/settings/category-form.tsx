import {
  bucketSchema,
  bucketWriteSchema,
  categoryCreateSchema,
  categoryKinds,
  categorySchema,
  categoryUpdateSchema,
  type Category,
  type CategoryGroup,
  type CategoryKind,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { useEditors } from "@/editors/editor-api";
import { useActiveBuckets } from "@/editors/lookups";
import { categoryError } from "@/settings/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const noGroup = "none";

type CategoryFormProps = {
  category: Category | null;
  groups: CategoryGroup[];
  initialName?: string;
  initialKind?: CategoryKind;
  onClose: () => void;
  onSaved: (id: string) => void;
};

function isKind(value: string): value is CategoryKind {
  return (categoryKinds as readonly string[]).includes(value);
}

export function CategoryForm({ category, groups, initialName, initialKind, onClose, onSaved }: CategoryFormProps) {
  const { openEditor } = useEditors();
  const buckets = useActiveBuckets();
  const [name, setName] = useState(category?.name ?? initialName ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? initialKind ?? "expense");
  const [groupId, setGroupId] = useState(category?.groupId ?? noGroup);
  const [extraGroups, setExtraGroups] = useState<CategoryGroup[]>([]);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const expense = kind === "expense";
  const groupOptions = [...groups, ...extraGroups.filter((group) => !groups.some((item) => item.id === group.id))].map((group) => ({
    id: group.id,
    label: group.name,
  }));

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      <DialogHeader>
        <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        <DialogDescription>
          {category
            ? "Change the name, the kind, the group, or whether it is essential."
            : "Add a category for income or expenses."}
        </DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field>
          <FieldLabel htmlFor="category-name">Name</FieldLabel>
          <Input id="category-name" value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="category-kind">Kind</FieldLabel>
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
            <SelectTrigger id="category-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="category-group">Group</FieldLabel>
          <OptionCombobox
            id="category-group"
            value={groupId === noGroup ? null : groupId}
            options={groupOptions}
            placeholder="No group"
            emptyLabel="No group"
            create={{
              noun: "group",
              onCreate: (typed) => {
                void openEditor("group", { id: null, name: typed }).then((id) => {
                  if (!id) {
                    return;
                  }
                  setExtraGroups((current) => [...current, { id, name: typed }]);
                  setGroupId(id);
                });
              },
            }}
            onChange={(id) => setGroupId(id ?? noGroup)}
          />
        </Field>
        {!category && expense ? (
          <Field>
            <FieldLabel htmlFor="category-bucket">Add to a bucket</FieldLabel>
            <OptionCombobox
              id="category-bucket"
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
              id="category-essential"
              checked={essential}
              onCheckedChange={(checked) => setEssential(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="category-essential">Essential</FieldLabel>
              <FieldDescription>A cost you must pay. The emergency fund check uses this flag.</FieldDescription>
            </FieldContent>
          </Field>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving category" : "Save category"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
