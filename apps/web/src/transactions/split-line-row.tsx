import { X } from "lucide-react";
import { InlineCategory } from "@/editors/inline-records";
import { ManagedPicker } from "@/editors/managed-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Option, type OptionGroup } from "@/transactions/option-combobox";
import { type SplitLine } from "@/transactions/what-choice";

const categoryPrefix = "category:";
const accountPrefix = "account:";

type SplitLineRowProps = {
  idPrefix: string;
  index: number;
  line: SplitLine;
  categoryGroups: OptionGroup[];
  accounts: Option[];
  archivedCategories: Option[];
  archivedAccounts: Option[];
  categoryLocked: boolean;
  transferLocked: boolean;
  amountsLocked: boolean;
  depth: number;
  onChange: (patch: Partial<SplitLine>) => void;
  onRemove: (() => void) | null;
  onRestoreCategory: (id: string) => void;
  onRestoreAccount: (id: string) => void;
};

function pickerValue(line: SplitLine): string | null {
  if (line.categoryId) {
    return `${categoryPrefix}${line.categoryId}`;
  }
  return line.transferAccountId ? `${accountPrefix}${line.transferAccountId}` : null;
}

export function SplitLineRow({
  idPrefix,
  index,
  line,
  categoryGroups,
  accounts,
  archivedCategories,
  archivedAccounts,
  categoryLocked,
  transferLocked,
  amountsLocked,
  depth,
  onChange,
  onRemove,
  onRestoreCategory,
  onRestoreAccount,
}: SplitLineRowProps) {
  const isTransfer = line.transferAccountId !== null;
  const transferFrozen = transferLocked || amountsLocked;
  const allowTransfer = !transferFrozen || isTransfer;
  const disabled = isTransfer ? transferFrozen : line.categoryId ? categoryLocked : categoryLocked && !allowTransfer;
  const groups: OptionGroup[] = [
    ...(isTransfer && transferFrozen ? [] : categoryGroups.map((group) => ({ label: group.label, options: group.options.map((item) => ({ id: `${categoryPrefix}${item.id}`, label: item.label })) }))),
    ...(allowTransfer ? [{ label: "Transfer", options: accounts.map((item) => ({ id: `${accountPrefix}${item.id}`, label: `Transfer to ${item.label}` })) }] : []),
  ];
  const archived = [
    ...archivedCategories.map((item) => ({ id: `${categoryPrefix}${item.id}`, label: item.label })),
    ...(allowTransfer ? archivedAccounts.map((item) => ({ id: `${accountPrefix}${item.id}`, label: item.label })) : []),
  ];

  function change(id: string | null) {
    if (id === null) {
      onChange({ categoryId: null, transferAccountId: null });
    } else if (id.startsWith(accountPrefix)) {
      onChange({ transferAccountId: id.slice(accountPrefix.length), categoryId: null });
    } else {
      onChange({ categoryId: id.slice(categoryPrefix.length), transferAccountId: null });
    }
  }

  function restore(id: string) {
    if (id.startsWith(accountPrefix)) {
      onRestoreAccount(id.slice(accountPrefix.length));
    } else {
      onRestoreCategory(id.slice(categoryPrefix.length));
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-auto">
        <FieldLabel>Line {index + 1}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={line.direction}
          disabled={amountsLocked}
          onValueChange={(value) => {
            if (value === "out" || value === "in") {
              onChange({ direction: value });
            }
          }}
        >
          <ToggleGroupItem value="out">Money out</ToggleGroupItem>
          <ToggleGroupItem value="in">Money in</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field className="w-32">
        <FieldLabel htmlFor={`${idPrefix}-line-${index}-amount`}>Amount</FieldLabel>
        <Input
          id={`${idPrefix}-line-${index}-amount`}
          inputMode="decimal"
          value={line.amount}
          disabled={amountsLocked}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </Field>
      <Field className="min-w-48 flex-1">
        <FieldLabel htmlFor={`${idPrefix}-line-${index}-target`}>Category or account</FieldLabel>
        <ManagedPicker
          id={`${idPrefix}-line-${index}-target`}
          value={pickerValue(line)}
          options={[]}
          groups={groups}
          placeholder="Choose one"
          emptyLabel="No category"
          disabled={disabled}
          noun="category"
          depth={depth}
          archived={archived}
          onRestore={restore}
          onChange={change}
          renderForm={(name, finish) => <InlineCategory name={name} kind="expense" depth={depth + 1} onDone={(saved) => finish(saved === null ? null : `${categoryPrefix}${saved}`)} />}
        />
      </Field>
      {onRemove ? (
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
          <X />
        </Button>
      ) : null}
    </div>
  );
}
