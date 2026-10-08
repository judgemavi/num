import type { MoneyDirection, Tag } from "@num/shared";
import { ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OptionCombobox, type Option } from "@/transactions/option-combobox";

export function MoneySection({
  direction,
  onDirection,
  amount,
  onAmount,
  moneyLocked,
  accountId,
  accountOptions,
  onAccount,
  accountLocked,
  date,
  onDate,
}: {
  direction: MoneyDirection;
  onDirection: (direction: MoneyDirection) => void;
  amount: string;
  onAmount: (amount: string) => void;
  moneyLocked: boolean;
  accountId: string;
  accountOptions: Option[];
  onAccount: (id: string) => void;
  accountLocked: boolean;
  date: string;
  onDate: (date: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel>Direction</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={direction}
          disabled={moneyLocked}
          onValueChange={(value) => {
            if (value === "out" || value === "in") {
              onDirection(value);
            }
          }}
        >
          <ToggleGroupItem value="out">Money out</ToggleGroupItem>
          <ToggleGroupItem value="in">Money in</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-amount">Amount</FieldLabel>
        <Input id="txn-amount" inputMode="decimal" value={amount} disabled={moneyLocked} onChange={(event) => onAmount(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="txn-account">Account</FieldLabel>
          <OptionCombobox
            id="txn-account"
            value={accountId || null}
            options={accountOptions}
            placeholder="Choose an account"
            disabled={accountLocked || accountOptions.length === 0}
            onChange={(id) => {
              if (id) {
                onAccount(id);
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-date">Date</FieldLabel>
          <Input id="txn-date" type="date" value={date} disabled={accountLocked} onChange={(event) => onDate(event.target.value)} required />
        </Field>
      </div>
    </>
  );
}

export function MoreDetails({
  open,
  onOpenChange,
  notes,
  onNotes,
  tags,
  tagIds,
  onTags,
  payee,
  onPayee,
  payeeLocked,
  cleared,
  onCleared,
  clearedLocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string;
  onNotes: (notes: string) => void;
  tags: Tag[];
  tagIds: string[];
  onTags: (ids: string[]) => void;
  payee: string;
  onPayee: (payee: string) => void;
  payeeLocked: boolean;
  cleared: boolean;
  onCleared: (cleared: boolean) => void;
  clearedLocked: boolean;
}) {
  const selected = tags.filter((tag) => tagIds.includes(tag.id));
  const options = tags
    .filter((tag) => tag.archivedAt === null && !tagIds.includes(tag.id))
    .map((tag) => ({ id: tag.id, label: tag.name }));
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
        <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        More details
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 pt-3">
        <Field>
          <FieldLabel htmlFor="txn-notes">Notes</FieldLabel>
          <Textarea id="txn-notes" value={notes} onChange={(event) => onNotes(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-tag">Tags</FieldLabel>
          <OptionCombobox
            id="txn-tag"
            value={null}
            options={options}
            placeholder={options.length === 0 ? "No tags to add" : "Add a tag"}
            disabled={options.length === 0}
            onChange={(tagId) => {
              if (tagId) {
                onTags([...tagIds, tagId]);
              }
            }}
          />
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((tag) => (
                <Toggle
                  key={tag.id}
                  variant="outline"
                  pressed
                  aria-label={`Remove ${tag.name}`}
                  onPressedChange={() => onTags(tagIds.filter((id) => id !== tag.id))}
                >
                  {tag.name}
                </Toggle>
              ))}
            </div>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-payee">Bank text</FieldLabel>
          <Input id="txn-payee" value={payee} disabled={payeeLocked} onChange={(event) => onPayee(event.target.value)} />
          {payeeLocked ? <FieldDescription>The bank text stays as it was imported.</FieldDescription> : null}
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="txn-cleared" checked={cleared} disabled={clearedLocked} onCheckedChange={(value) => onCleared(value === true)} />
          <FieldLabel htmlFor="txn-cleared">Cleared</FieldLabel>
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DeleteMenu({ kind, onDelete }: { kind: "plain" | "mirror" | "linked"; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="More">
            <Ellipsis strokeWidth={1.8} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-11" onSelect={() => setOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "mirror"
                ? "This also deletes the other side of the transfer."
                : kind === "linked"
                  ? "The other account stays. Its line returns to the Inbox."
                  : "The transaction leaves the list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
