import { bucketKinds, type Bucket } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { BucketPickers } from "@/buckets/bucket-pickers";
import { bucketBody, bucketValues } from "@/buckets/bucket-values";
import { localAsOf } from "@/as-of";
import { requestError } from "@/buckets/format";
import { bucketOptionsQuery, useCreateBucket, useUpdateBucket } from "@/api/buckets";
import { choiceIn } from "@/components/choice";
import { ChoiceCard } from "@/components/choice-card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { useActiveBuckets, useBookCurrency, useCategories, useCategoryNames } from "@/editors/lookups";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup } from "@/components/ui/radio-group";

const kindChoices = [
  { value: "spending", title: "Spending", description: "Filled up to an amount. What is left carries over." },
  { value: "sinking", title: "Saving for a bill", description: "Set aside an amount by a due date." },
  { value: "goal", title: "Goal", description: "Save toward a target." },
] as const;

const repeatOptions = [
  { value: "none", label: "One time" },
  { value: "yearly", label: "Every year" },
] as const;

const goalOptions = [
  { value: "date", label: "By a date" },
  { value: "month", label: "A set amount each month" },
] as const;

/** The form of a bucket. A new bucket gets the next colour of the rotation and the priority after the last active bucket. */
export function BucketForm({ draft }: { draft: Bucket | "new" }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const board = useActiveBuckets();
  const current = draft === "new" ? null : draft;
  const [more, setMore] = useState(Boolean(current?.essential));
  const create = useCreateBucket();
  const update = useUpdateBucket();
  const form = useAppForm({
    defaultValues: bucketValues(current, board.nextColor, board.items.reduce((max, item) => Math.max(max, item.priority), 0)),
    validators: {
      onSubmit: ({ value }) => bucketBody(currency, value, current).error ?? undefined,
    },
    onSubmit: async ({ value, formApi }) => {
      const { body, patch } = bucketBody(currency, value, current);
      if (!body) {
        return;
      }
      // An edit with no change closes without a write.
      if (current && !patch) {
        close();
        return;
      }
      try {
        const saved =
          current && patch ? await update.mutateAsync({ id: current.id, body: patch }) : await create.mutateAsync({ asOf: localAsOf(), body });
        close(saved.id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "The bucket did not save. Try again."), fields: {} } });
      }
    },
  });
  const kind = useStore(form.store, (state) => state.values.kind);
  const goalMode = useStore(form.store, (state) => state.values.goalMode);

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>{current ? "Edit bucket" : "New bucket"}</DialogTitle>
          <DialogDescription>A bucket keeps money for one purpose. The balance carries over.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="name">{(field) => <field.TextField id="bucket-name" label="Name" required />}</form.AppField>
          {kind === "emergency" ? null : (
            <form.Field name="kind">
              {(field) => (
                <Field>
                  <FieldLabel>Kind</FieldLabel>
                  <RadioGroup
                    value={field.state.value}
                    className="grid gap-2"
                    onValueChange={(value) => {
                      const next = choiceIn(bucketKinds, value);
                      if (next) {
                        field.handleChange(next);
                      }
                    }}
                  >
                    {kindChoices.map((choice) => (
                      <ChoiceCard key={choice.value} value={choice.value} title={choice.title} description={choice.description} />
                    ))}
                  </RadioGroup>
                </Field>
              )}
            </form.Field>
          )}
          {kind === "spending" ? (
            <form.AppField name="refillTo">
              {(field) => (
                <field.MoneyField
                  id="bucket-refill"
                  label="Fill up to"
                  required
                  description="Each month the bucket is topped up to this amount. Money you did not spend stays in the bucket."
                />
              )}
            </form.AppField>
          ) : null}
          {kind === "sinking" ? (
            <>
              <form.AppField name="amount">{(field) => <field.MoneyField id="bucket-amount" label="Amount to save" required />}</form.AppField>
              <form.AppField name="dueDate">{(field) => <field.DateInputField id="bucket-due" label="Due date" required />}</form.AppField>
              <form.AppField name="repeat">{(field) => <field.SelectField id="bucket-repeat" label="Repeat" options={repeatOptions} />}</form.AppField>
            </>
          ) : null}
          {kind === "goal" ? (
            <>
              <form.AppField name="target">{(field) => <field.MoneyField id="bucket-target" label="Target" required />}</form.AppField>
              <form.AppField name="goalMode">{(field) => <field.SelectField id="bucket-goal-mode" label="How to save" options={goalOptions} />}</form.AppField>
              {goalMode === "date" ? (
                <form.AppField name="targetDate">{(field) => <field.DateInputField id="bucket-target-date" label="Target date" required />}</form.AppField>
              ) : (
                <form.AppField name="fixedAmount">{(field) => <field.MoneyField id="bucket-fixed" label="Each month" required />}</form.AppField>
              )}
            </>
          ) : null}
          {kind === "emergency" ? (
            <>
              <form.AppField name="months">
                {(field) => (
                  <field.TextField
                    id="bucket-months"
                    label="Months to keep"
                    inputMode="numeric"
                    required
                    description="The target is this number of months of your essential spending. The app calculates the spending."
                  />
                )}
              </form.AppField>
              <form.AppField name="fillMonths">
                {(field) => (
                  <field.TextField
                    id="bucket-fill-months"
                    label="Months to fill it"
                    inputMode="numeric"
                    required
                    description="Each month adds an equal part, so an empty bucket is full after this many months."
                  />
                )}
              </form.AppField>
            </>
          ) : null}
          <BucketPickers form={form} suggest={current === null} />
          {kind === "emergency" ? null : (
            <form.Field name="categoryIds">
              {(field) => <CategoryField bucketId={current?.id ?? null} selected={field.state.value} onChange={field.handleChange} />}
            </form.Field>
          )}
          <form.AppField name="startDate">
            {(field) => (
              <field.DateInputField
                id="bucket-start"
                label="Start date"
                required
                description={kind === "emergency" ? "The bucket is funded from the month of this date." : "The bucket is funded from the month of this date. Spending in these categories counts from this date."}
              />
            )}
          </form.AppField>
          <Collapsible open={more} onOpenChange={setMore}>
            <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
              <ChevronRight className={`size-4 transition-transform ${more ? "rotate-90" : ""}`} aria-hidden="true" />
              {kind === "emergency" ? "More options: priority" : "More options: priority, essential"}
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-3">
              <form.AppField name="priority">
                {(field) => <field.TextField id="bucket-priority" label="Priority" inputMode="numeric" required description="Lower numbers are funded first." />}
              </form.AppField>
              {kind === "emergency" ? null : <form.AppField name="essential">{(field) => <field.SwitchField id="bucket-essential" label="Essential" />}</form.AppField>}
            </CollapsibleContent>
          </Collapsible>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton>Save</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}

/** The expense categories of the bucket. The field offers the active expense categories that are not in a different bucket. */
function CategoryField({ bucketId, selected, onChange }: { bucketId: string | null; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const categories = useCategories();
  const names = useCategoryNames();
  const { data: buckets } = useSuspenseQuery(bucketOptionsQuery());
  const taken = new Set(buckets.filter((bucket) => bucket.id !== bucketId).flatMap((bucket) => bucket.categoryIds));
  const remaining = categories.filter(
    (category) => category.kind === "expense" && !category.archivedAt && !taken.has(category.id) && !selected.includes(category.id),
  );

  return (
    <Field>
      <FieldLabel>Categories</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between rounded-xl font-normal">
            Add an expense category
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder="Search" />
            <CommandList>
              <CommandEmpty>No expense categories left.</CommandEmpty>
              <CommandGroup>
                {remaining.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.name}
                    onSelect={() => {
                      onChange([...selected, category.id]);
                      setOpen(false);
                    }}
                  >
                    {category.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <ul className="grid gap-1">
          {selected.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 text-sm">
              <span>{names.get(id) ?? "Category"}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${names.get(id) ?? "category"}`}
                onClick={() => onChange(selected.filter((item) => item !== id))}
              >
                <X strokeWidth={1.8} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <FieldDescription>Each expense category can be in one bucket.</FieldDescription>
    </Field>
  );
}
