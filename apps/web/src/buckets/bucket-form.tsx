import {
  bucketKinds,
  bucketWriteSchema,
  fromMinorUnits,
  toMinorUnits,
  type Bucket,
} from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BucketPickers } from "@/buckets/bucket-pickers";
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
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { useActiveBuckets, useBookCurrency, useCategories, useCategoryNames } from "@/editors/lookups";
import { ChoiceSelect } from "@/components/choice-select";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

type GoalMode = "date" | "paycheck";

function money(currency: string, minor: number | null) {
  if (minor === null) {
    return "";
  }
  return fromMinorUnits(currency, minor);
}

function readMoney(currency: string, text: string) {
  return toMinorUnits(currency, text.trim());
}

/** The form of a bucket. A new bucket gets the next colour of the rotation and the priority after the last active bucket. */
export function BucketForm({ draft }: { draft: Bucket | "new" }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const board = useActiveBuckets();
  const current = draft === "new" ? null : draft;
  const [name, setName] = useState(current?.name ?? "");
  const [kind, setKind] = useState(current?.kind ?? "spending");
  const [color, setColor] = useState(current?.color ?? board.nextColor);
  const [icon, setIcon] = useState(current?.icon ?? "shopping-cart");
  const [categoryIds, setCategoryIds] = useState(current?.categoryIds ?? []);
  const [startDate, setStartDate] = useState(current?.startDate ?? localAsOf());
  const [refillTo, setRefillTo] = useState(money(currency, current?.refillTo ?? null));
  const [amount, setAmount] = useState(money(currency, current?.amount ?? null));
  const [dueDate, setDueDate] = useState(current?.dueDate ?? "");
  const [repeat, setRepeat] = useState(current?.repeat ?? "none");
  const [target, setTarget] = useState(money(currency, current?.target ?? null));
  const [targetDate, setTargetDate] = useState(current?.targetDate ?? "");
  const [fixedAmount, setFixedAmount] = useState(money(currency, current?.fixedAmount ?? null));
  const [goalMode, setGoalMode] = useState<GoalMode>(current?.fixedAmount !== null && current?.fixedAmount !== undefined ? "paycheck" : "date");
  const [priority, setPriority] = useState(() => String(current?.priority ?? board.items.reduce((max, item) => Math.max(max, item.priority), 0) + 1));
  const [essential, setEssential] = useState(current?.essential ?? false);
  const [more, setMore] = useState(Boolean(current?.essential));
  const [invalid, setInvalid] = useState<string | null>(null);
  const create = useCreateBucket();
  const update = useUpdateBucket();
  const failure = create.error ?? update.error;
  const error = invalid ?? (failure ? requestError(failure, "The bucket did not save. Try again.") : null);
  const saving = create.isPending || update.isPending;


  function onSubmit(event: FormEvent) {
    event.preventDefault();
    let body;
    try {
      const priorityNumber = Number(priority);
      body = {
        name: name.trim(),
        kind,
        priority: priorityNumber,
        essential,
        color,
        icon,
        categoryIds,
        startDate,
        refillTo: kind === "spending" ? readMoney(currency, refillTo) : null,
        amount: kind === "sinking" ? readMoney(currency, amount) : null,
        dueDate: kind === "sinking" ? dueDate : null,
        repeat: kind === "sinking" ? repeat : null,
        target: kind === "goal" ? readMoney(currency, target) : null,
        targetDate: kind === "goal" && goalMode === "date" ? targetDate : null,
        fixedAmount: kind === "goal" && goalMode === "paycheck" ? readMoney(currency, fixedAmount) : null,
      };
    } catch {
      setInvalid("Enter amounts as numbers.");
      return;
    }
    const parsed = bucketWriteSchema.safeParse(body);
    if (!parsed.success) {
      setInvalid("Check the bucket fields.");
      return;
    }
    setInvalid(null);
    const done = { onSuccess: (saved: { id: string }) => close(saved.id) };
    if (current) {
      update.mutate({ id: current.id, body: parsed.data }, done);
    } else {
      create.mutate({ asOf: localAsOf(), body: parsed.data }, done);
    }
  }

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{current ? "Edit bucket" : "New bucket"}</DialogTitle>
        <DialogDescription>A bucket keeps money for one purpose. The balance carries over.</DialogDescription>
      </DialogHeader>
      <DialogBody>
      <Field>
        <FieldLabel htmlFor="bucket-name">Name</FieldLabel>
        <Input id="bucket-name" value={name} required onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel>Kind</FieldLabel>
        <RadioGroup
          value={kind}
          className="grid gap-2"
          onValueChange={(value) => {
            const next = choiceIn(bucketKinds, value);
            if (next) {
              setKind(next);
            }
          }}
        >
          <ChoiceCard value="spending" title="Spending" description="Filled up to an amount. What is left carries over." />
          <ChoiceCard value="sinking" title="Saving for a bill" description="Set aside an amount by a due date." />
          <ChoiceCard value="goal" title="Goal" description="Save toward a target." />
        </RadioGroup>
      </Field>
      {kind === "spending" ? (
        <Field>
          <FieldLabel htmlFor="bucket-refill">Fill up to</FieldLabel>
          <Input id="bucket-refill" inputMode="decimal" value={refillTo} required onChange={(event) => setRefillTo(event.target.value)} />
        </Field>
      ) : null}
      {kind === "sinking" ? (
        <>
          <Field>
            <FieldLabel htmlFor="bucket-amount">Amount to save</FieldLabel>
            <Input id="bucket-amount" inputMode="decimal" value={amount} required onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="bucket-due">Due date</FieldLabel>
            <DateField id="bucket-due" value={dueDate} required onChange={setDueDate} />
          </Field>
          <Field>
            <FieldLabel htmlFor="bucket-repeat">Repeat</FieldLabel>
            <ChoiceSelect
              id="bucket-repeat" className="w-full"
              value={repeat}
              options={[
                { value: "none", label: "One time" },
                { value: "yearly", label: "Every year" },
              ]}
              onValueChange={setRepeat}
            />
          </Field>
        </>
      ) : null}
      {kind === "goal" ? (
        <>
          <Field>
            <FieldLabel htmlFor="bucket-target">Target</FieldLabel>
            <Input id="bucket-target" inputMode="decimal" value={target} required onChange={(event) => setTarget(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="bucket-goal-mode">How to save</FieldLabel>
            <ChoiceSelect
              id="bucket-goal-mode" className="w-full"
              value={goalMode}
              options={[
                { value: "date", label: "By a date" },
                { value: "paycheck", label: "A set amount each paycheck" },
              ]}
              onValueChange={setGoalMode}
            />
          </Field>
          {goalMode === "date" ? (
            <Field>
              <FieldLabel htmlFor="bucket-target-date">Target date</FieldLabel>
              <DateField id="bucket-target-date" value={targetDate} required onChange={setTargetDate} />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="bucket-fixed">Each paycheck</FieldLabel>
              <Input id="bucket-fixed" inputMode="decimal" value={fixedAmount} required onChange={(event) => setFixedAmount(event.target.value)} />
            </Field>
          )}
        </>
      ) : null}
      <BucketPickers color={color} icon={icon} suggest={current === null} onColor={setColor} onIcon={setIcon} />
      <CategoryField bucketId={current?.id ?? null} selected={categoryIds} onChange={setCategoryIds} />
      <Field>
        <FieldLabel htmlFor="bucket-start">Start date</FieldLabel>
        <DateField id="bucket-start" value={startDate} required onChange={setStartDate} />
        <FieldDescription>Spending in these categories counts from this date.</FieldDescription>
      </Field>
      <Collapsible open={more} onOpenChange={setMore}>
        <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
          <ChevronRight className={`size-4 transition-transform ${more ? "rotate-90" : ""}`} aria-hidden="true" />
          More options: priority, essential
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-4 pt-3">
          <Field>
            <FieldLabel htmlFor="bucket-priority">Priority</FieldLabel>
            <Input id="bucket-priority" inputMode="numeric" value={priority} required onChange={(event) => setPriority(event.target.value)} />
            <FieldDescription>Lower numbers are funded first.</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Switch id="bucket-essential" checked={essential} onCheckedChange={setEssential} />
            <FieldLabel htmlFor="bucket-essential">Essential</FieldLabel>
          </Field>
        </CollapsibleContent>
      </Collapsible>
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      </DialogFooter>
    </DialogForm>
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
