import {
  categoryCreateSchema,
  categoryKinds,
  categorySchema,
  categoryUpdateSchema,
  type Category,
  type CategoryGroup,
  type CategoryKind,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { categoryError } from "@/settings/format";
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
  onClose: () => void;
  onSaved: () => void;
};

function isKind(value: string): value is CategoryKind {
  return (categoryKinds as readonly string[]).includes(value);
}

export function CategoryForm({ category, groups, onClose, onSaved }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "expense");
  const [groupId, setGroupId] = useState(category?.groupId ?? noGroup);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const expense = kind === "expense";

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
      onSaved();
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
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger id="category-group" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noGroup}>No group</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
