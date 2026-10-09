import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormActions, FormHeading } from "@/editors/form-chrome";
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

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
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
        <FormActions inline={inline}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? savingLabel : submitLabel}
          </Button>
        </FormActions>
      </form>
    </>
  );
}
