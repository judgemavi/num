import { choicesForDirection, defaultChoice, merchantForChoice } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Ellipsis } from "lucide-react";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { inboxDecisionsQuery, useUndoDecision } from "@/api/review";
import { useArchiveTag } from "@/api/tags";
import { useTags } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { withForm } from "@/forms/form-hook";
import { useStore } from "@tanstack/react-form";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TagForm } from "@/settings/tag-form";
import { decisionText } from "@/review/format";
import { AccountPicker } from "@/transactions/pickers";
import { blankTransaction, quietChange } from "@/transactions/transaction-draft";

/** Money out or in, the amount, the account and the date of a transaction that the person enters by hand. */
export const MoneySection = withForm({
  defaultValues: blankTransaction,
  props: { moneyLocked: false, accountLocked: false },
  render: function MoneySectionRender({ form, moneyLocked, accountLocked }) {
    return (
      <>
        <form.Field
          name="direction"
          listeners={{
            // The choice must be one of the choices of the direction.
            onChange: ({ value, fieldApi }) => {
              if (!choicesForDirection(value).includes(fieldApi.form.getFieldValue("choice"))) {
                const next = defaultChoice(value);
                fieldApi.form.setFieldValue("choice", next, quietChange);
                fieldApi.form.setFieldValue("categoryId", null, quietChange);
                fieldApi.form.setFieldValue("merchantId", (current) => merchantForChoice(next, current), quietChange);
              }
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel>Direction</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={field.state.value}
                disabled={moneyLocked}
                onValueChange={(value) => {
                  if (value === "out" || value === "in") {
                    field.handleChange(value);
                  }
                }}
              >
                <ToggleGroupItem value="out">Money out</ToggleGroupItem>
                <ToggleGroupItem value="in">Money in</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        </form.Field>
        <form.AppField name="amount">{(field) => <field.MoneyField id="txn-amount" label="Amount" disabled={moneyLocked} />}</form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field
            name="accountId"
            listeners={{
              // A transfer goes to a different account.
              onChange: ({ value, fieldApi }) => {
                if (fieldApi.form.getFieldValue("transferAccountId") === value) {
                  fieldApi.form.setFieldValue("transferAccountId", null, quietChange);
                }
              },
            }}
          >
            {(field) => (
              <Field>
                <FieldLabel htmlFor="txn-account">Account</FieldLabel>
                <AccountPicker
                  id="txn-account"
                  value={field.state.value || null}
                  disabled={accountLocked}
                  onChange={(id) => {
                    if (id) {
                      field.handleChange(id);
                    }
                  }}
                />
              </Field>
            )}
          </form.Field>
          <form.AppField name="date">{(field) => <field.DateInputField id="txn-date" label="Date" disabled={accountLocked} required />}</form.AppField>
        </div>
      </>
    );
  },
});

/**
 * Notes, tags, the bank text and "Cleared". The section is closed until the person opens it. It opens by itself when
 * a save stops because the bank text is empty.
 */
export const MoreDetails = withForm({
  defaultValues: blankTransaction,
  props: { payeeLocked: false, clearedLocked: false },
  render: function MoreDetailsRender({ form, payeeLocked, clearedLocked }) {
    const [open, setOpen] = useState(false);
    const needsPayee = useStore(form.store, (state) => state.submissionAttempts > 0 && state.values.payee.trim().length === 0);
    // A change of state during render: the section opens in the same render as the error, and stays open.
    if (needsPayee && !open) {
      setOpen(true);
    }
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
          <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
          More details
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-4 pt-3">
          <form.AppField name="notes">{(field) => <field.TextareaField id="txn-notes" label="Notes" />}</form.AppField>
          <form.Field name="tagIds">{(field) => <TagsField tagIds={field.state.value} onTags={field.handleChange} />}</form.Field>
          <form.AppField name="payee">
            {(field) => (
              <field.TextField
                id="txn-payee"
                label="Bank text"
                disabled={payeeLocked}
                description={payeeLocked ? "The bank text stays as it was imported." : undefined}
              />
            )}
          </form.AppField>
          <form.AppField name="cleared">{(field) => <field.CheckboxField id="txn-cleared" label="Cleared" disabled={clearedLocked} />}</form.AppField>
        </CollapsibleContent>
      </Collapsible>
    );
  },
});

/** The tags of the transaction: a picker that adds a tag, and a button for each tag that removes it. */
function TagsField({ tagIds, onTags }: { tagIds: string[]; onTags: (ids: string[]) => void }) {
  const archiveTag = useArchiveTag();
  const tags = useTags();
  const [created, setCreated] = useState<typeof tags>([]);
  const allTags = [...tags, ...created.filter((tag) => !tags.some((item) => item.id === tag.id))];
  const selected = allTags.filter((tag) => tagIds.includes(tag.id));
  const options = allTags.filter((tag) => tag.archivedAt === null && !tagIds.includes(tag.id)).map((tag) => ({ id: tag.id, label: tag.name }));
  return (
    <Field>
      <FieldLabel htmlFor="txn-tag">Tags</FieldLabel>
      <ManagedPicker
        id="txn-tag"
        value={null}
        options={options}
        placeholder="Add a tag"
        noun="tag"
        archived={allTags.filter((tag) => tag.archivedAt).map((tag) => ({ id: tag.id, label: tag.name }))}
        onRestore={(id) => archiveTag.mutate({ id, restore: true }, { onSuccess: (restored) => onTags([...tagIds, restored.id]) })}
        onChange={(tagId) => {
          if (tagId) {
            onTags([...tagIds, tagId]);
          }
        }}
        onCreated={(option) => setCreated((current) => [...current, { id: option.id, name: option.label, archivedAt: null }])}
        renderForm={(name) => <TagForm inline id={null} idPrefix="inline-tag-name" initialName={name} />}
      />
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((tag) => (
            <Toggle key={tag.id} variant="outline" pressed aria-label={`Remove ${tag.name}`} onPressedChange={() => onTags(tagIds.filter((id) => id !== tag.id))}>
              {tag.name}
            </Toggle>
          ))}
        </div>
      ) : null}
    </Field>
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

/** The answers that the person gave in Needs review for a transaction. Each answer has an Undo button. */
export function DecisionNotes({ transactionId }: { transactionId: string }) {
  const undo = useUndoDecision();
  const { data: decisions } = useSuspenseQuery({
    ...inboxDecisionsQuery(),
    select: (rows) =>
      rows.filter(
        (row) =>
          (row.decision === "not_transfer" && row.itemKey.split(":").includes(transactionId)) ||
          (row.decision === "keep_unassigned" && row.itemKey === `paycheck_funding:${transactionId}`) ||
          (row.decision === "keep_uncategorized" && row.itemKey === `uncategorized:${transactionId}`) ||
          (row.decision === "not_linked" && row.itemKey === `refund_link:${transactionId}`),
      ),
  });
  return (
    <>
      {decisions.map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{decisionText(row.decision)}</span>
          <Button type="button" variant="outline" onClick={() => undo.mutate(row.itemKey)}>
            Undo
          </Button>
        </p>
      ))}
    </>
  );
}
