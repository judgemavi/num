import { ChoiceSelect } from "@/components/choice-select";
import { sortKey, type SortChoice } from "@/lists/list-search";

type SortSelectProps<Column extends string> = {
  id: string;
  label: string;
  value: SortChoice<Column>;
  options: readonly (SortChoice<Column> & { label: string })[];
  onChange: (choice: SortChoice<Column>) => void;
};

/** The sort control of a list. Each option is a column of the list query schema and a direction. */
export function SortSelect<Column extends string>({ id, label, value, options, onChange }: SortSelectProps<Column>) {
  return (
    <ChoiceSelect
      id={id}
      aria-label={label}
      className="w-fit min-w-44"
      itemClassName="min-h-11"
      value={sortKey(value)}
      options={options.map((option) => ({ value: sortKey(option), label: option.label }))}
      onValueChange={(key) => {
        const option = options.find((item) => sortKey(item) === key);
        if (option) {
          onChange({ sort: option.sort, dir: option.dir });
        }
      }}
    />
  );
}
