import { X } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { usePhone } from "@/components/use-phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type FilterBadge = {
  key: string;
  label: string;
  onRemove: () => void;
};

type FilterBarProps = {
  /** The search box of the list. */
  search?: ReactNode;
  activeCount: number;
  badges: FilterBadge[];
  fields: ReactNode;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
  onClear: () => void;
  onClearAll: () => void;
  /** The sort control of the list. */
  sort?: ReactNode;
};

function FiltersButton({ count, ...props }: { count: number } & ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="secondary" className="shrink-0" {...props}>
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

  return (
    <div className="grid gap-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 max-md:flex-wrap">
        {search}
        {phone ? (
          <Sheet open={open} onOpenChange={changeOpen}>
            <SheetTrigger asChild>
              <FiltersButton count={activeCount} />
            </SheetTrigger>
            <SheetContent side="bottom" aria-describedby={undefined} className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-t-[20px] p-0">
              <SheetHeader className="shrink-0 px-4 pt-4">
                <SheetTitle className="font-display text-2xl font-extrabold uppercase [font-stretch:72%]">Filters</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{fields}</div>
              <SheetFooter className="shrink-0">
                <PanelActions onApply={apply} onClear={onClear} />
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild>
              <FiltersButton count={activeCount} />
            </PopoverTrigger>
            <PopoverContent align="start" className="flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
              <PopoverHeader className="shrink-0 px-4 pt-4">
                <PopoverTitle className="text-base font-semibold">Filters</PopoverTitle>
              </PopoverHeader>
              <div className="min-h-0 overflow-y-auto px-4 py-4">{fields}</div>
              <div className="shrink-0 px-4 pb-4">
                <PanelActions onApply={apply} onClear={onClear} />
              </div>
            </PopoverContent>
          </Popover>
        )}
        {badges.length > 0 ? (
          <Button type="button" variant="ghost" onClick={onClearAll}>
            Clear
          </Button>
        ) : null}
        {sort ? (
          <div className="ml-auto shrink-0 max-md:ml-0 max-md:min-w-0 max-md:flex-1">{sort}</div>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.key} variant="neutral" className="h-11 gap-1 overflow-visible px-3 text-sm font-semibold">
              {badge.label}
              <Button type="button" variant="ghost" size="icon" className="-mr-3" aria-label={`Remove ${badge.label}`} onClick={badge.onRemove}>
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
