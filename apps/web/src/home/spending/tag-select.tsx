import { Field, FieldLabel } from "@/components/ui/field";
import { useTags } from "@/editors/lookups";
import { useSpendingSearch } from "@/home/spending/use-spending";
import { OptionCombobox } from "@/transactions/option-combobox";

/**
 * The tag of Spending on Home. "All spending" is no tag. The list has the active tags, then the archived tags: an old
 * trip tag is usually archived. It reads the tag from the URL and changes it there.
 */
export function TagSelect() {
  const { search, patchSearch } = useSpendingSearch();
  const options = useTags().map((tag) => ({ id: tag.id, label: tag.archivedAt ? `${tag.name} (archived)` : tag.name }));
  return (
    <Field className="w-56 max-md:w-auto max-md:min-w-28 max-md:flex-1 max-md:basis-0">
      <FieldLabel htmlFor="spending-tag">Tag</FieldLabel>
      <OptionCombobox
        id="spending-tag"
        value={search.tagId ?? null}
        options={options}
        placeholder="All spending"
        emptyLabel="All spending"
        preserveOrder
        onChange={(tagId) => patchSearch({ tagId: tagId ?? undefined })}
      />
    </Field>
  );
}
