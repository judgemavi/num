import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type NameFormProps = {
  title: string;
  description: string;
  label: string;
  submitLabel: string;
  savingLabel: string;
  initialName: string;
  inline?: boolean;
  idPrefix?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<string | null>;
};

export function NameForm({
  title,
  description,
  label,
  submitLabel,
  savingLabel,
  initialName,
  inline = false,
  idPrefix = "record-name",
  onClose,
  onSubmit,
}: NameFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    try {
      const message = await onSubmit(trimmed);
      if (message) {
        setError(message);
        return;
      }
      onClose();
    } catch {
      setError("The change did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FormHeading inline={inline} title={title} description={description} />
      <FormShell inline={inline} className="flex flex-col gap-4" onSubmit={() => void submit()}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
        <Field>
          <FieldLabel htmlFor={idPrefix}>{label}</FieldLabel>
          <Input
            id={idPrefix}
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel inline={inline} onClose={onClose}>
            Cancel
          </FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={saving} onClick={inline ? () => void submit() : undefined}>
            {saving ? savingLabel : submitLabel}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
