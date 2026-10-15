import { archivedNameMatch } from "@num/shared";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { fieldControl, fieldControlIcon } from "@/components/field-control";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Option<Id extends string = string> = {
  id: Id;
  label: string;
};

type CreateAction = {
  noun: string;
  suggestedName?: string;
  onCreate: (name: string) => void;
};

type ArchivedMatch = {
  id: string;
  label: string;
};

type OptionComboboxProps<Id extends string> = {
  id: string;
  value: string | null;
  options: Option<Id>[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  create?: CreateAction;
  archived?: ArchivedMatch[];
  onRestore?: (id: string) => void;
  preserveOrder?: boolean;
  onChange: (id: Id | null) => void;
};

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function visibleOptions<Id extends string>(options: Option<Id>[], query: string, preserveOrder: boolean) {
  const needle = query.trim().toLocaleLowerCase();
  const matched = needle.length === 0 ? options : options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
  if (preserveOrder) {
    return matched;
  }
  return [...matched].sort((left, right) => {
    const leftExact = sameName(left.label, query) ? 0 : 1;
    const rightExact = sameName(right.label, query) ? 0 : 1;
    if (leftExact !== rightExact) {
      return leftExact - rightExact;
    }
    return left.label.localeCompare(right.label);
  });
}

/** The one Combobox (Command + Popover) of the app. Every picker of a long list of options uses it. */
export function OptionCombobox<Id extends string>({
  id,
  value,
  options,
  placeholder,
  emptyLabel,
  disabled = false,
  invalid = false,
  create,
  archived,
  onRestore,
  preserveOrder = false,
  onChange,
}: OptionComboboxProps<Id>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.id === value);
  const query = search.trim();
  const prefill = query.length > 0 ? query : (create?.suggestedName?.trim() ?? "");
  const archivedHit = archivedNameMatch(
    query,
    options.map((option) => option.label),
    (archived ?? []).map((item) => ({ id: item.id, name: item.label })),
  );

  function pick(next: Id | null) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

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
          disabled={disabled}
          className={cn(fieldControl, selected ? "" : "text-muted-foreground")}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className={fieldControlIcon} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search" value={search} onValueChange={setSearch} />
          <CommandList>
            {create ? (
              <CommandGroup>
                <CommandItem
                  value={`create-${create.noun}`}
                  onSelect={() => {
                    create.onCreate(prefill);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  + Create new {create.noun}
                </CommandItem>
              </CommandGroup>
            ) : null}
            {archivedHit && onRestore ? (
              <CommandGroup>
                <CommandItem
                  value={`restore-${archivedHit.id}`}
                  onSelect={() => {
                    onRestore(archivedHit.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  Restore '{archivedHit.name}'
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandEmpty>No matches.</CommandEmpty>
            {emptyLabel ? (
              <CommandGroup>
                <CommandItem value={emptyLabel} onSelect={() => pick(null)}>
                  {emptyLabel}
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              {visibleOptions(options, query, preserveOrder).map((option) => (
                <CommandItem key={option.id} value={option.label} onSelect={() => pick(option.id)}>
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
