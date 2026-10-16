import { choiceIn } from "@/components/choice";
import { choicesForDirection, defaultChoice, merchantForChoice } from "@num/shared";
import { Ellipsis } from "lucide-react";
import { useEditors } from "@/editors/editor-api";
import { useArchiveTag } from "@/api/tags";
import { useTags } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { searchDelayMs } from "@/lists/list-search";
import { withForm } from "@/forms/form-hook";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TagForm } from "@/settings/tag-form";
import { AccountPicker } from "@/transactions/pickers";
import { blankTransaction, quietChange } from "@/transactions/transaction-draft";

/** Money out or in, the amount, the account and the date of a transaction that the person enters by hand. */
export const MoneySection = withForm({
  defaultValues: blankTransaction,
  props: { moneyLocked: false },
  render: function MoneySectionRender({ form, moneyLocked }) {
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
                  const next = choiceIn(["out", "in"], value);
                  if (next) {
                    field.handleChange(next);
                  }
                }}
              >
                <ToggleGroupItem value="out">Money out</ToggleGroupItem>
                <ToggleGroupItem value="in">Money in</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        </form.Field>
        <form.AppField name="amount" listeners={{
          onChangeDebounceMs: searchDelayMs,
          onChange: ({ value, fieldApi }) => fieldApi.form.setFieldValue("suggestionAmount", value, quietChange),
        }}>{(field) => <field.MoneyField id="txn-amount" label="Amount" disabled={moneyLocked} />}</form.AppField>
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
                  onChange={(id) => {
                    if (id) {
                      field.handleChange(id);
                    }
                  }}
                />
              </Field>
            )}
          </form.Field>
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
  const allTags = tags;
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
