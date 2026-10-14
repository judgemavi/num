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
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
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
  pending,
  error,
  onClose,
  onSubmit,
}: NameFormProps) {
  const [name, setName] = useState(initialName);
  const [nameMissing, setNameMissing] = useState(false);
  const message = nameMissing ? "Enter a name." : error;

  function submit() {
    const trimmed = name.trim();
    setNameMissing(trimmed.length === 0);
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  }

  return (
    <>
      <FormHeading inline={inline} title={title} description={description} />
      <FormShell inline={inline} className="flex flex-col gap-4" onSubmit={submit}>
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
        {message ? <FieldError>{message}</FieldError> : null}
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel inline={inline} onClose={onClose}>
            Cancel
          </FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={pending} onClick={inline ? submit : undefined}>
            {pending ? savingLabel : submitLabel}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
