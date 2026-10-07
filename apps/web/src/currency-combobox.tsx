import { currencyCodes, type CurrencyCode } from "@num/shared";
import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type CurrencyComboboxProps = {
  id: string;
  value: string;
  invalid?: boolean;
  onChange: (code: CurrencyCode) => void;
};

function currencyLabel(code: string, names: Intl.DisplayNames | null): string {
  const name = names?.of(code);
  if (!name || name.toUpperCase() === code) {
    return code;
  }
  return `${name} (${code})`;
}

export function CurrencyCombobox({ id, value, invalid = false, onChange }: CurrencyComboboxProps) {
  const [open, setOpen] = useState(false);
  const names = useMemo(() => {
    if (typeof Intl.DisplayNames !== "function") {
      return null;
    }
    return new Intl.DisplayNames(undefined, { type: "currency" });
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="h-11 w-full justify-between font-normal"
        >
          <span className="truncate">{value ? currencyLabel(value, names) : "Select a currency"}</span>
          <ChevronsUpDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Search by name or code" />
          <CommandList>
            <CommandEmpty>No currency matches.</CommandEmpty>
            <CommandGroup>
              {currencyCodes.map((code) => (
                <CommandItem
                  key={code}
                  value={currencyLabel(code, names)}
                  data-checked={value === code}
                  onSelect={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                >
                  {currencyLabel(code, names)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
