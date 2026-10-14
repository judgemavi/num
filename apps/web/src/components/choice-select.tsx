import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ChoiceSelectProps<Value extends string> = {
  id?: string;
  /** The choice. With no choice, the control shows `placeholder`. */
  value: Value | undefined;
  placeholder?: string;
  options: readonly { value: Value; label: ReactNode }[];
  onValueChange: (value: Value) => void;
  /** The class of the trigger. */
  className?: string;
  itemClassName?: string;
  "aria-label"?: string;
};

/** A `Select` for a fixed list of choices. `onValueChange` gives the type of the choices. */
export function ChoiceSelect<Value extends string>({ id, value, placeholder, options, onValueChange, className, itemClassName, "aria-label": label }: ChoiceSelectProps<Value>) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) {
          onValueChange(option.value);
        }
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className={itemClassName}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
