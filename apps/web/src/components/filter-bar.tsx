import { Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePhone } from "@/components/use-phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type FilterBadge = {
  key: string;
  label: string;
  onRemove: () => void;
};

export type FilterSort = {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

type FilterSearch = {
  id: string;
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
};

type FilterBarProps = {
  search?: FilterSearch;
  activeCount: number;
  badges: FilterBadge[];
  fields: ReactNode;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
  onClear: () => void;
  onClearAll: () => void;
  sort?: FilterSort;
};

function FiltersButton({ count }: { count: number }) {
  return (
    <Button type="button" variant="secondary" className="shrink-0">
      Filters
      {count > 0 ? <Badge variant="neutral">{count}</Badge> : null}
    </Button>
  );
}

function PanelActions({ onApply, onClear }: { onApply: () => void; onClear: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t pt-3">
      <Button type="button" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      <Button type="button" onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}

function SortControl({ sort }: { sort: FilterSort }) {
  return (
    <Select value={sort.value} onValueChange={sort.onChange}>
      <SelectTrigger id={sort.id} aria-label={sort.label} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sort.options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="min-h-11">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({
  search,
  activeCount,
  badges,
  fields,
  onOpenChange,
  onApply,
  onClear,
  onClearAll,
  sort,
}: FilterBarProps) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);

  function changeOpen(next: boolean) {
    onOpenChange(next);
    setOpen(next);
  }

  function apply() {
    onApply();
    setOpen(false);
  }

  const panel = (
    <div className="grid gap-4">
      {fields}
      <PanelActions onApply={apply} onClear={onClear} />
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        {search ? (
          <InputGroup className="h-11 max-w-80 min-w-0 flex-1 rounded-xl">
            <InputGroupAddon>
              <Search size={18} aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id={search.id}
              value={search.value}
              placeholder={search.placeholder}
              aria-label={search.label}
              onChange={(event) => search.onChange(event.target.value)}
            />
          </InputGroup>
        ) : null}
        {phone ? (
          <Sheet open={open} onOpenChange={changeOpen}>
            <SheetTrigger asChild>
              <FiltersButton count={activeCount} />
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[20px] p-4">
              <SheetHeader className="px-0">
                <SheetTitle className="font-display text-2xl font-extrabold uppercase [font-stretch:72%]">Filters</SheetTitle>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild>
              <FiltersButton count={activeCount} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-4">
              <p className="text-base font-semibold">Filters</p>
              {panel}
            </PopoverContent>
          </Popover>
        )}
        {sort ? (
          <div className="ml-auto shrink-0">
            <SortControl sort={sort} />
          </div>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.key} variant="neutral" className="h-11 gap-1 overflow-visible px-3 text-sm font-semibold">
              {badge.label}
              <button
                type="button"
                className="grid size-11 place-items-center rounded-full"
                aria-label={`Remove ${badge.label}`}
                onClick={badge.onRemove}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
