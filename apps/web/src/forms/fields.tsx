import type { ComponentProps, ReactNode } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { DateField } from "@/components/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFieldContext } from "@/forms/form-context";
import { OptionCombobox } from "@/transactions/option-combobox";

/** The parts that each field component shows around its control: the label, the help text and the place in the layout. */
type FieldFrame = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  labelClassName?: string;
};

function Frame({ id, label, description, className, labelClassName, children }: FieldFrame & { children: ReactNode }) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

type InputProps = FieldFrame & Omit<ComponentProps<typeof Input>, "id" | "name" | "value" | "onChange" | "onBlur" | "className">;

/** A text field. */
export function TextField({ id, label, description, className, labelClassName, ...input }: InputProps) {
  const field = useFieldContext<string>();
  return (
    <Frame id={id} label={label} description={description} className={className} labelClassName={labelClassName}>
      <Input
        {...input}
        id={id}
        name={field.name}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
      />
    </Frame>
  );
}

/** A field for an amount of money as the person types it. The form reads the text when it submits. */
export function MoneyField(props: InputProps) {
  return <TextField inputMode="decimal" autoComplete="off" {...props} />;
}

export function TextareaField({ id, label, description, className }: FieldFrame) {
  const field = useFieldContext<string>();
  return (
    <Frame id={id} label={label} description={description} className={className}>
      <Textarea id={id} name={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
    </Frame>
  );
}

/** A calendar date as ISO text. An empty text is no date. */
export function DateInputField({
  id,
  label,
  description,
  className,
  required,
  disabled,
}: FieldFrame & { required?: boolean; disabled?: boolean }) {
  const field = useFieldContext<string>();
  return (
    <Frame id={id} label={label} description={description} className={className}>
      <DateField id={id} value={field.state.value} required={required} disabled={disabled} onChange={field.handleChange} />
    </Frame>
  );
}

/** One choice of a short, fixed list. With no choice, the control shows `placeholder`. */
export function SelectField<Value extends string>({
  id,
  label,
  description,
  className,
  options,
  placeholder,
}: FieldFrame & { options: readonly { value: Value; label: ReactNode }[]; placeholder?: string }) {
  const field = useFieldContext<Value | null>();
  return (
    <Frame id={id} label={label} description={description} className={className}>
      <ChoiceSelect
        id={id}
        className="w-full"
        value={field.state.value ?? undefined}
        placeholder={placeholder}
        options={options}
        onValueChange={field.handleChange}
      />
    </Frame>
  );
}

/** One choice of a long list, with a search. */
export function ComboboxField({
  id,
  label,
  description,
  className,
  ...combobox
}: FieldFrame & Pick<ComponentProps<typeof OptionCombobox>, "options" | "placeholder" | "emptyLabel" | "disabled">) {
  const field = useFieldContext<string | null>();
  return (
    <Frame id={id} label={label} description={description} className={className}>
      <OptionCombobox {...combobox} id={id} value={field.state.value} onChange={field.handleChange} />
    </Frame>
  );
}

/** An on/off choice with the label after the switch. */
export function SwitchField({ id, label }: Pick<FieldFrame, "id" | "label">) {
  const field = useFieldContext<boolean>();
  return (
    <Field orientation="horizontal">
      <Switch id={id} checked={field.state.value} onCheckedChange={field.handleChange} />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}

/** A yes/no choice with the label and the help text after the box. */
export function CheckboxField({ id, label, description, disabled }: Pick<FieldFrame, "id" | "label" | "description"> & { disabled?: boolean }) {
  const field = useFieldContext<boolean>();
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={field.state.value} disabled={disabled} onCheckedChange={(checked) => field.handleChange(checked === true)} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}
