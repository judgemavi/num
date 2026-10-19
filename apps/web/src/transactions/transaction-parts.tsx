import { useState } from "react";
import { accountFitsChoice } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { Ellipsis } from "lucide-react";
import { useEditors } from "@/editors/editor-api";
import { useArchiveTag } from "@/api/tags";
import { useBookCurrency, useTags } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { searchDelayMs } from "@/lists/list-search";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { Toggle } from "@/components/ui/toggle";
import { TagForm } from "@/settings/tag-form";
import { AccountPicker } from "@/transactions/pickers";
import { refundPurchaseLabel } from "@/transactions/format";
import { blankTransaction, quietChange } from "@/transactions/transaction-draft";
import { useDraftReview } from "@/transactions/use-draft-suggestion";

/** The other account of a transfer, with the hint of a transfer pair. The list does not have the account of the transaction. */
export const TransferAccountField = withForm({
  defaultValues: blankTransaction,
  props: { label: "", locked: false, transactionId: fieldValue<string | null>(null) },
  render: function TransferAccountFieldRender({ form, label, locked, transactionId }) {
    const currency = useBookCurrency();
    const review = useDraftReview(transactionId);
    const pair = review?.question === "transfer_pair" ? review.transfer : null;
    const accountId = useStore(form.store, (state) => state.values.accountId);
    return (
      <form.Field name="transferAccountId">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="txn-transfer">{label}</FieldLabel>
            <AccountPicker id="txn-transfer" value={field.state.value} exceptId={accountId} disabled={locked} onChange={field.handleChange} />
            {pair && field.state.value === pair.otherAccountId ? (
              <FieldDescription>{`Links to ${refundPurchaseLabel(currency, pair.otherPayee, pair.otherDate, pair.otherAmount)}.`}</FieldDescription>
            ) : null}
          </Field>
        )}
      </form.Field>
    );
  },
});

/**
 * The amount, the account and the date of a transaction that the person enters by hand. The type sets the accounts
 * in the list. A transfer shows "From account" and "To account": the account of this transaction is the side that
 * `transferSide` gives.
 */
export const MoneySection = withForm({
  defaultValues: blankTransaction,
  props: {
    moneyLocked: false,
    transactionId: fieldValue<string | null>(null),
    /** The account that the form starts with. It stays in the list for each type. */
    startAccountId: fieldValue<string | null>(null),
  },
  render: function MoneySectionRender({ form, moneyLocked, transactionId, startAccountId }) {
    const choice = useStore(form.store, (state) => state.values.choice);
    const side = useStore(form.store, (state) => state.values.transferSide);
    const otherId = useStore(form.store, (state) => state.values.transferAccountId);
    const transfer = choice === "transfer";
    const account = (
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
            <FieldLabel htmlFor="txn-account">{transfer ? (side === "out" ? "From account" : "To account") : "Account"}</FieldLabel>
            <AccountPicker
              id="txn-account"
              value={field.state.value || null}
              exceptId={transfer ? (otherId ?? undefined) : undefined}
              only={(item) => item.id === startAccountId || accountFitsChoice(choice, item.kind)}
              onChange={(id) => {
                if (id) {
                  field.handleChange(id);
                }
              }}
            />
          </Field>
        )}
      </form.Field>
    );
    const other = (
      <TransferAccountField form={form} label={side === "out" ? "To account" : "From account"} locked={moneyLocked} transactionId={transactionId} />
    );
    return (
      <>
        <form.AppField name="amount" listeners={{
          onChangeDebounceMs: searchDelayMs,
          onChange: ({ value, fieldApi }) => fieldApi.form.setFieldValue("suggestionAmount", value, quietChange),
        }}>{(field) => <field.MoneyField id="txn-amount" label="Amount" disabled={moneyLocked} />}</form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          {transfer && side === "in" ? other : null}
          {account}
          {transfer && side === "out" ? other : null}
          <form.AppField name="date">{(field) => <field.DateInputField id="txn-date" label="Date" required />}</form.AppField>
        </div>
      </>
    );
  },
});

/**
 * The tags of the transaction: a picker that adds a tag, and a button for each tag that removes it. The bulk editor
 * uses it for "Add tags".
 */
export function TagsField({ id = "txn-tag", label = "Tags", tagIds, onTags }: { id?: string; label?: string; tagIds: string[]; onTags: (ids: string[]) => void }) {
  const archiveTag = useArchiveTag();
  const tags = useTags();
  const [created, setCreated] = useState<typeof tags>([]);
  const allTags = [...tags, ...created.filter((tag) => !tags.some((item) => item.id === tag.id))];
  const selected = allTags.filter((tag) => tagIds.includes(tag.id));
  const options = allTags.filter((tag) => tag.archivedAt === null && !tagIds.includes(tag.id)).map((tag) => ({ id: tag.id, label: tag.name }));
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <ManagedPicker
        id={id}
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
