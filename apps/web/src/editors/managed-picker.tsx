import { canOfferInlineCreate, finishInlineCreate } from "@num/shared";
import { useState, type ReactNode } from "react";
import { Boundary } from "@/components/boundary";
import { EditorFrameContext } from "@/editors/editor-api";
import { OptionCombobox, type Option } from "@/transactions/option-combobox";

type ManagedPickerProps = {
  id: string;
  value: string | null;
  options: Option[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  noun: string;
  suggestedName?: string;
  archived?: Option[];
  onRestore?: (id: string) => void;
  onChange: (id: string | null) => void;
  depth?: number;
  /** The form that creates a new option, with the typed text as the name. The form closes through `useEditorFrame()`. */
  renderForm?: (name: string) => ReactNode;
  /** The option id of a record that the form created. Use it when the option ids are not the record ids. */
  createdId?: (savedId: string) => string;
  onCreated?: (option: Option) => void;
};

export function ManagedPicker({
  id,
  value,
  options,
  placeholder,
  emptyLabel,
  disabled,
  noun,
  suggestedName,
  archived,
  onRestore,
  onChange,
  depth = 0,
  renderForm,
  createdId = (savedId) => savedId,
  onCreated,
}: ManagedPickerProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [added, setAdded] = useState<Option[]>([]);
  const extras = added.filter((item) => !options.some((option) => option.id === item.id));
  const merged = [...options, ...extras];
  const offer = Boolean(renderForm) && canOfferInlineCreate(depth);

  /** The inline form closed. A saved record becomes the selected option. */
  function finishCreate(savedId: string | null = null) {
    if (savedId !== null && draft !== null) {
      const option = { id: createdId(savedId), label: draft.trim().length > 0 ? draft.trim() : `New ${noun}` };
      setAdded((current) => [...current, option]);
      onCreated?.(option);
      onChange(finishInlineCreate(value, option.id).selectedId);
    }
    setDraft(null);
  }

  return (
    <div className="grid gap-3">
      <OptionCombobox
        id={id}
        value={value}
        options={merged}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        disabled={disabled}
        archived={archived}
        onRestore={onRestore}
        create={offer ? { noun, suggestedName, onCreate: (name) => setDraft(name) } : undefined}
        onChange={onChange}
      />
      {draft !== null && renderForm ? (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
          <EditorFrameContext value={{ close: finishCreate }}>
            <Boundary look="panel" loading={`Loading the ${noun} form.`} failed={`The ${noun} form did not load.`}>
              {renderForm(draft)}
            </Boundary>
          </EditorFrameContext>
        </section>
      ) : null}
    </div>
  );
}
