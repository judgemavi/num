import { archivedNameMatch } from "@num/shared";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Option = {
  id: string;
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

type OptionComboboxProps = {
  id: string;
  value: string | null;
  options: Option[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  create?: CreateAction;
  archived?: ArchivedMatch[];
  onRestore?: (id: string) => void;
  preserveOrder?: boolean;
  onChange: (id: string | null) => void;
};

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function visibleOptions(options: Option[], query: string, preserveOrder: boolean): Option[] {
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

export function OptionCombobox({
  id,
  value,
  options,
  placeholder,
  emptyLabel,
  disabled = false,
  create,
  archived,
  onRestore,
  preserveOrder = false,
  onChange,
}: OptionComboboxProps) {
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

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between rounded-xl font-normal">
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown />
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
