import { canOfferInlineCreate, finishInlineCreate } from "@num/shared";
import { useState, type ReactNode } from "react";
import { OptionCombobox, type Option, type OptionGroup } from "@/transactions/option-combobox";

type ManagedPickerProps = {
  id: string;
  value: string | null;
  options: Option[];
  groups?: OptionGroup[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  noun: string;
  suggestedName?: string;
  archived?: Option[];
  onRestore?: (id: string) => void;
  onChange: (id: string | null) => void;
  depth?: number;
  preserveOrder?: boolean;
  renderForm?: (name: string, finish: (savedId: string | null) => void) => ReactNode;
};

export function ManagedPicker({
  id,
  value,
  options,
  groups,
  placeholder,
  emptyLabel,
  disabled,
  noun,
  suggestedName,
  archived,
  onRestore,
  onChange,
  depth = 0,
  preserveOrder,
  renderForm,
}: ManagedPickerProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [added, setAdded] = useState<Option[]>([]);
  const extras = added.filter((item) => !options.some((option) => option.id === item.id) && !groups?.some((group) => group.options.some((option) => option.id === item.id)));
  const merged = [...options, ...extras];
  const mergedGroups = groups?.map((group, index) => (index === 0 ? { ...group, options: [...group.options, ...extras] } : group));
  const offer = Boolean(renderForm) && canOfferInlineCreate(depth);

  return (
    <div className="grid gap-3">
      <OptionCombobox
        id={id}
        value={value}
        options={merged}
        groups={mergedGroups}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        disabled={disabled}
        preserveOrder={preserveOrder}
        archived={archived}
        onRestore={onRestore}
        create={offer ? { noun, suggestedName, onCreate: (name) => setDraft(name) } : undefined}
        onChange={onChange}
      />
      {draft !== null && renderForm ? (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
          {renderForm(draft, (savedId) => {
            const result = finishInlineCreate(value, savedId);
            if (savedId !== null) {
              const label = draft.trim().length > 0 ? draft.trim() : `New ${noun}`;
              setAdded((current) => [...current, { id: savedId, label }]);
              onChange(result.selectedId);
            }
            setDraft(null);
          })}
        </section>
      ) : null}
    </div>
  );
}
