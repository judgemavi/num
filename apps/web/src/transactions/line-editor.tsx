import type { Category, Tag } from "@num/shared";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyLine, type LineDraft } from "@/transactions/line-draft";
import { OptionCombobox, type Option } from "@/transactions/option-combobox";

type LineEditorProps = {
  currency: string;
  lines: LineDraft[];
  categories: Category[];
  tags: Tag[];
  transferOptions: Option[];
  disabled: boolean;
  amountLocked: boolean;
  onChange: (lines: LineDraft[]) => void;
};

function activeOptions(items: { id: string; name: string; archivedAt: string | null }[], selected: string | null) {
  return items
    .filter((item) => item.archivedAt === null || item.id === selected)
    .map((item) => ({
      id: item.id,
      label: item.archivedAt ? `${item.name} (archived)` : item.name,
    }));
}

export function LineEditor({
  currency,
  lines,
  categories,
  tags,
  transferOptions,
  disabled,
  amountLocked,
  onChange,
}: LineEditorProps) {
  function update(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col gap-4">
      {lines.map((line, index) => {
        const selectedTags = tags.filter((tag) => line.tagIds.includes(tag.id));
        const tagOptions = tags
          .filter((tag) => tag.archivedAt === null && !line.tagIds.includes(tag.id))
          .map((tag) => ({ id: tag.id, label: tag.name }));
        return (
          <fieldset key={line.key} className="reveal">
            <legend>Line {index + 1}</legend>
            <Field>
              <FieldLabel htmlFor={`${line.key}-amount`}>Amount</FieldLabel>
              <Input
                id={`${line.key}-amount`}
                inputMode="decimal"
                value={line.amount}
                disabled={disabled || amountLocked}
                onChange={(event) => update(line.key, { amount: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${line.key}-memo`}>Memo</FieldLabel>
              <Input
                id={`${line.key}-memo`}
                value={line.memo}
                disabled={disabled}
                onChange={(event) => update(line.key, { memo: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${line.key}-category`}>Category</FieldLabel>
              <OptionCombobox
                id={`${line.key}-category`}
                value={line.categoryId}
                options={activeOptions(categories, line.categoryId)}
                placeholder="No category"
                emptyLabel="No category"
                disabled={disabled || amountLocked}
                onChange={(categoryId) =>
                  update(line.key, {
                    categoryId,
                    transferAccountId: categoryId ? null : line.transferAccountId,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${line.key}-transfer`}>Transfer to</FieldLabel>
              <OptionCombobox
                id={`${line.key}-transfer`}
                value={line.transferAccountId}
                options={transferOptions}
                placeholder="No transfer"
                emptyLabel="No transfer"
                disabled={disabled || amountLocked}
                onChange={(transferAccountId) =>
                  update(line.key, {
                    transferAccountId,
                    categoryId: transferAccountId ? null : line.categoryId,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${line.key}-tag`}>Tags</FieldLabel>
              <OptionCombobox
                id={`${line.key}-tag`}
                value={null}
                options={tagOptions}
                placeholder={tagOptions.length === 0 ? "No tags to add" : "Add a tag"}
                disabled={disabled || tagOptions.length === 0}
                onChange={(tagId) => {
                  if (tagId) {
                    update(line.key, { tagIds: [...line.tagIds, tagId] });
                  }
                }}
              />
              {selectedTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <Toggle
                      key={tag.id}
                      variant="outline"
                      pressed
                      disabled={disabled}
                      aria-label={`Remove ${tag.name}`}
                      onPressedChange={() => update(line.key, { tagIds: line.tagIds.filter((id) => id !== tag.id) })}
                    >
                      {tag.name}
                    </Toggle>
                  ))}
                </div>
              ) : null}
            </Field>
            {lines.length > 1 && !amountLocked && !disabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
              >
                Remove line
              </Button>
            ) : null}
          </fieldset>
        );
      })}
      {!disabled && !amountLocked ? (
        <Button type="button" variant="outline" onClick={() => onChange([...lines, emptyLine(currency)])}>
          Add a line
        </Button>
      ) : null}
    </div>
  );
}
