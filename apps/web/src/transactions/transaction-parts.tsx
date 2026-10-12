import type { Account, AutoReason, Category, Merchant, MoneyDirection, Tag, Transaction } from "@num/shared";
import { ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { InlineNamed } from "@/editors/inline-records";
import { useRestoreNamed } from "@/editors/restore-named";
import { ManagedPicker } from "@/editors/managed-picker";
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
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InlineAccount } from "@/editors/inline-records";
import { automaticReasonText } from "@/transactions/format";
import { type Option } from "@/transactions/option-combobox";

export function MoneySection({
  direction,
  onDirection,
  amount,
  onAmount,
  moneyLocked,
  accountId,
  accountOptions,
  archivedAccounts = [],
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
  archivedAccounts?: Option[];
  onAccount: (id: string) => void;
  accountLocked: boolean;
  date: string;
  onDate: (date: string) => void;
}) {
  const restoreNamed = useRestoreNamed();
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
          <ManagedPicker
            id="txn-account"
            value={accountId || null}
            options={accountOptions}
            placeholder="Choose an account"
            disabled={accountLocked || (accountOptions.length === 0 && archivedAccounts.length === 0)}
            noun="account"
            archived={archivedAccounts}
            onRestore={(id) => {
              void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
                if (restored) {
                  onAccount(restored);
                }
              });
            }}
            onChange={(id) => {
              if (id) {
                onAccount(id);
              }
            }}
            renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-date">Date</FieldLabel>
          <DateField id="txn-date" value={date} disabled={accountLocked} onChange={onDate} required />
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
  const restoreNamed = useRestoreNamed();
  const [created, setCreated] = useState<Tag[]>([]);
  const allTags = [...tags, ...created.filter((tag) => !tags.some((item) => item.id === tag.id))];
  const selected = allTags.filter((tag) => tagIds.includes(tag.id));
  const options = allTags
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
          <ManagedPicker
            id="txn-tag"
            value={null}
            options={options}
            placeholder="Add a tag"
            noun="tag"
            archived={allTags.filter((tag) => tag.archivedAt).map((tag) => ({ id: tag.id, label: tag.name }))}
            onRestore={(id) => {
              void restoreNamed(`/api/tags/${id}/restore`).then((restored) => {
                if (restored) {
                  onTags([...tagIds, restored]);
                }
              });
            }}
            onChange={(tagId) => {
              if (tagId) {
                onTags([...tagIds, tagId]);
              }
            }}
            renderForm={(name, finish) => (
              <InlineNamed
                noun="tag"
                title="New tag"
                description="Use a tag for a trip or a project."
                name={name}
                path="/api/tags"
                idPrefix="inline-tag-name"
                onDone={(id) => {
                  if (id) {
                    setCreated((current) => [...current, { id, name, archivedAt: null }]);
                  }
                  finish(id);
                }}
              />
            )}
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
  const { confirm } = useEditors();
  const description =
    kind === "mirror"
      ? "This also deletes the other side of the transfer."
      : kind === "linked"
        ? "The other account stays. Its line returns to Needs review."
        : "The transaction leaves the list.";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="More">
          <Ellipsis strokeWidth={1.8} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="min-h-11"
          onSelect={() => {
            void confirm({ title: "Delete this transaction?", description, confirmLabel: "Delete" }).then((ok) => {
              if (ok) {
                onDelete();
              }
            });
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type TransactionFormProps = {
  currency: string;
  transaction: Transaction | null;
  amountLocked: boolean;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  merchants: Merchant[];
  rawLine?: string;
  initialAccountId?: string;
  unreadableItemKey?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDelete: () => Promise<string | null>;
  deleteKind?: "plain" | "mirror" | "linked";
  decisions?: { itemKey: string; text: string }[];
  onUndoDecision?: (itemKey: string) => Promise<{ ok: boolean; code?: string }>;
};

export function AutomaticReason({
  transaction,
}: {
  transaction: Pick<Transaction, "autoReason" | "autoConfidence" | "autoSourceName" | "autoLearnedCount" | "refundOf"> & { autoReason: AutoReason };
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {automaticReasonText({
        reason: transaction.autoReason,
        sourceName: transaction.autoSourceName,
        learnedCount: transaction.autoLearnedCount,
        purchaseDate: transaction.refundOf?.date ?? null,
        purchasePayee: transaction.refundOf?.payeeRaw ?? null,
      })}
    </p>
  );
}
