import { categoryKindForChoice } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { choiceIn } from "@/components/choice";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCategories, useTagNames } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { bulkChoices, bulkValues, merchantModes } from "@/transactions/bulk-values";
import { AccountPicker, CategoryPicker, MerchantPicker } from "@/transactions/pickers";
import { TagsField } from "@/transactions/transaction-parts";

const choiceLabel = {
  none: "No change",
  spending: "Spending",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
} satisfies Record<(typeof bulkChoices)[number], string>;

/**
 * "What is this?" of the bulk editor. The category choices follow the direction, as in the single
 * editor. Transfer shows only when all rows are in one account (`accountId`).
 */
export const BulkWhatField = withForm({
  defaultValues: bulkValues,
  props: {
    choices: fieldValue<(typeof bulkChoices)[number][]>(["none"]),
    accountId: fieldValue<string | null>(null),
  },
  render: function BulkWhatFieldRender({ form, choices, accountId }) {
    const categories = useCategories();
    const what = useStore(form.store, (state) => state.values.what);
    const kind = what === "none" ? null : categoryKindForChoice(what);
    return (
      <>
        <form.Field
          name="what"
          listeners={{
            // A new choice keeps the category only when the category fits it.
            onChange: ({ value: next, fieldApi }) => {
              const nextKind = next === "none" ? null : categoryKindForChoice(next);
              const current = categories.find((category) => category.id === fieldApi.form.getFieldValue("categoryId"));
              if (!current || current.kind !== nextKind) {
                fieldApi.form.setFieldValue("categoryId", null);
              }
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel>What is this?</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                value={field.state.value}
                onValueChange={(value) => {
                  const next = choiceIn(choices, value);
                  if (next) {
                    field.handleChange(next);
                  }
                }}
              >
                {choices.map((item) => (
                  <ToggleGroupItem key={item} value={item}>
                    {choiceLabel[item]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {choices.length === 1 ? (
                <FieldDescription>To change this, select transactions of one account, or with money in one direction only.</FieldDescription>
              ) : null}
            </Field>
          )}
        </form.Field>
        {kind ? (
          <form.Field name="categoryId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="bulk-category">Category</FieldLabel>
                <CategoryPicker id="bulk-category" value={field.state.value} kind={kind} allowEmpty={false} onChange={field.handleChange} />
              </Field>
            )}
          </form.Field>
        ) : null}
        {what === "transfer" && accountId ? (
          <form.Field name="transferAccountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="bulk-transfer">Other account</FieldLabel>
                <AccountPicker id="bulk-transfer" value={field.state.value} exceptId={accountId} onChange={field.handleChange} />
              </Field>
            )}
          </form.Field>
        ) : null}
      </>
    );
  },
});

/** The merchant: "No change", or a merchant or "No merchant". A transfer has no merchant. */
export const BulkMerchantField = withForm({
  defaultValues: bulkValues,
  render: function BulkMerchantFieldRender({ form }) {
    const mode = useStore(form.store, (state) => state.values.merchant);
    return (
      <>
        <form.Field name="merchant">
          {(field) => (
            <Field>
              <FieldLabel>Merchant</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                value={field.state.value}
                onValueChange={(value) => {
                  const next = choiceIn(merchantModes, value);
                  if (next) {
                    field.handleChange(next);
                  }
                }}
              >
                <ToggleGroupItem value="none">No change</ToggleGroupItem>
                <ToggleGroupItem value="change">Change</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        </form.Field>
        {mode === "change" ? (
          <form.Field name="merchantId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="bulk-merchant">New merchant</FieldLabel>
                <MerchantPicker id="bulk-merchant" value={field.state.value} payee="" onChange={field.handleChange} />
              </Field>
            )}
          </form.Field>
        ) : null}
      </>
    );
  },
});

/** "Add tags" and "Remove tags". The editor does not replace all tags of a row. `present` is the tags of the rows. */
export const BulkTagFields = withForm({
  defaultValues: bulkValues,
  props: { present: fieldValue<string[]>([]) },
  render: function BulkTagFieldsRender({ form, present }) {
    const tagNames = useTagNames();
    return (
      <>
        <form.Field name="addTagIds">
          {(field) => <TagsField id="bulk-add-tag" label="Add tags" tagIds={field.state.value} onTags={field.handleChange} />}
        </form.Field>
        <form.Field name="removeTagIds">
          {(field) => (
            <Field>
              <FieldLabel>Remove tags</FieldLabel>
              {present.length === 0 ? (
                <FieldDescription>The selected transactions have no tags.</FieldDescription>
              ) : (
                <ToggleGroup type="multiple" variant="outline" spacing={2} className="flex-wrap" value={field.state.value} onValueChange={field.handleChange}>
                  {present.map((tagId) => (
                    <ToggleGroupItem key={tagId} value={tagId} aria-label={`Remove ${tagNames.get(tagId) ?? "tag"}`}>
                      {tagNames.get(tagId) ?? "Tag"}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </Field>
          )}
        </form.Field>
      </>
    );
  },
});
