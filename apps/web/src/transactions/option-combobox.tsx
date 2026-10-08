import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Option = {
  id: string;
  label: string;
};

export type OptionGroup = {
  label: string;
  options: Option[];
};

type CreateAction = {
  noun: string;
  suggestedName?: string;
  onCreate: (name: string) => void;
};

type OptionComboboxProps = {
  id: string;
  value: string | null;
  options: Option[];
  groups?: OptionGroup[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  create?: CreateAction;
  onChange: (id: string | null) => void;
};

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function visibleOptions(options: Option[], query: string): Option[] {
  const needle = query.trim().toLocaleLowerCase();
  const matched = needle.length === 0 ? options : options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
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
  groups,
  placeholder,
  emptyLabel,
  disabled = false,
  create,
  onChange,
}: OptionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.id === value) ?? groups?.flatMap((group) => group.options).find((option) => option.id === value);
  const query = search.trim();
  const createName = query.length > 0 ? query : (create?.suggestedName?.trim() ?? "");
  const pool = groups ? groups.flatMap((group) => group.options) : options;
  const exact = pool.some((option) => sameName(option.label, createName));
  const showCreate = Boolean(create) && createName.length > 0 && !exact;

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  const filteredGroups = groups?.map((group) => ({ label: group.label, options: visibleOptions(group.options, query) })).filter((group) => group.options.length > 0);

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
            <CommandEmpty>{showCreate ? "No matches." : "No matches."}</CommandEmpty>
            {emptyLabel ? (
              <CommandGroup>
                <CommandItem value={emptyLabel} onSelect={() => pick(null)}>
                  {emptyLabel}
                </CommandItem>
              </CommandGroup>
            ) : null}
            {filteredGroups ? (
              filteredGroups.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.options.map((option) => (
                    <CommandItem key={option.id} value={option.label} onSelect={() => pick(option.id)}>
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {visibleOptions(options, query).map((option) => (
                  <CommandItem key={option.id} value={option.label} onSelect={() => pick(option.id)}>
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && create ? (
              <CommandGroup>
                <CommandItem
                  value={`create-${createName}`}
                  onSelect={() => {
                    create.onCreate(createName);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  Create {createName}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
