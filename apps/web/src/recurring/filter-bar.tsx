import type { Account, PlanKind, PlanListQuery } from "@num/shared";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { kindLabel } from "@/recurring/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

type FilterDraft = {
  kind?: PlanKind;
  accountId?: string;
  archived: boolean;
};

type PlanFilterBarProps = {
  search: PlanListQuery;
  accounts: Account[];
  onChange: (patch: Partial<PlanListQuery>) => void;
};

const sorts = [
  { value: "name:asc", label: "Name" },
  { value: "name:desc", label: "Name, Z to A" },
  { value: "startDate:asc", label: "Start date" },
  { value: "startDate:desc", label: "Start date, newest" },
] as const;

function sortValue(search: PlanListQuery): string {
  return `${search.sort ?? "name"}:${search.dir ?? "asc"}`;
}

function FilterFields({
  draft,
  accounts,
  onDraft,
}: {
  draft: FilterDraft;
  accounts: Account[];
  onDraft: (patch: Partial<FilterDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="plan-kind">Kind</FieldLabel>
        <Select value={draft.kind ?? "any"} onValueChange={(value) => onDraft({ kind: value === "any" ? undefined : (value as PlanKind) })}>
          <SelectTrigger id="plan-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any kind</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="bill">Bill</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="plan-account">Account</FieldLabel>
        <OptionCombobox
          id="plan-account"
          value={draft.accountId ?? null}
          options={accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Any account"
          emptyLabel="Any account"
          onChange={(accountId) => onDraft({ accountId: accountId ?? undefined })}
        />
      </Field>
      <Field orientation="horizontal">
        <Switch id="plan-archived" checked={draft.archived} onCheckedChange={(archived) => onDraft({ archived })} />
        <FieldLabel htmlFor="plan-archived">Show archived</FieldLabel>
      </Field>
    </div>
  );
}

export function PlanFilterBar({ search, accounts, onChange }: PlanFilterBarProps) {
  const mobile = useIsMobile();
  const [text, setText] = useState(search.q ?? "");
  const [seenQuery, setSeenQuery] = useState(search.q);
  if (search.q !== seenQuery) {
    setSeenQuery(search.q);
    setText(search.q ?? "");
  }
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>({ kind: search.kind, accountId: search.accountId, archived: search.archived });
  const panelCount = [search.kind, search.accountId, search.archived ? "archived" : undefined].filter(Boolean).length;

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = text.trim();
      if (next === (search.q ?? "")) {
        return;
      }
      onChange({ q: next.length > 0 ? next : undefined });
    }, 300);
    return () => clearTimeout(handle);
  }, [text, search.q, onChange]);

  function openFilters(next: boolean) {
    if (next) {
      setDraft({ kind: search.kind, accountId: search.accountId, archived: search.archived });
    }
    setOpen(next);
  }

  function applyFilters() {
    onChange({ kind: draft.kind, accountId: draft.accountId, archived: draft.archived });
    setOpen(false);
  }

  function clearPanel() {
    setDraft({ archived: false });
    onChange({ kind: undefined, accountId: undefined, archived: false });
    setOpen(false);
  }

  const accountName = accounts.find((item) => item.id === search.accountId)?.name;
  const chips = [
    search.q ? { key: "q", label: `Search: ${search.q}` } : null,
    search.kind ? { key: "kind", label: `Kind: ${kindLabel(search.kind)}` } : null,
    accountName ? { key: "accountId", label: `Account: ${accountName}` } : null,
    search.archived ? { key: "archived", label: "Archived" } : null,
  ].filter((chip) => chip !== null);

  const fields = <FilterFields draft={draft} accounts={accounts} onDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))} />;
  const actions = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={clearPanel}>
        Clear
      </Button>
      <Button type="button" onClick={applyFilters}>
        Apply
      </Button>
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-nowrap items-center gap-2">
        <div className="relative min-w-0 max-w-[320px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search plans"
            value={text}
            className="pl-9"
            placeholder="Search plans"
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {mobile ? (
          <Sheet open={open} onOpenChange={openFilters}>
            <Button type="button" variant="secondary" onClick={() => openFilters(true)}>
              Filters
              {panelCount > 0 ? <Badge variant="count">{panelCount}</Badge> : null}
            </Button>
            <SheetContent side="bottom" className="rounded-t-[20px]">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="grid gap-4 px-4 pb-4">
                {fields}
                {actions}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={open} onOpenChange={openFilters}>
            <PopoverTrigger asChild>
              <Button type="button" variant="secondary">
                Filters
                {panelCount > 0 ? <Badge variant="count">{panelCount}</Badge> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 gap-4 p-4">
              {fields}
              {actions}
            </PopoverContent>
          </Popover>
        )}
        <div className="ml-auto w-44 shrink-0">
          <Select
            value={sortValue(search)}
            onValueChange={(value) => {
              const [sort, dir] = value.split(":");
              onChange({
                sort: sort === "name" ? undefined : (sort as PlanListQuery["sort"]),
                dir: dir === "asc" ? undefined : "desc",
              });
            }}
          >
            <SelectTrigger aria-label="Sort plans" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="neutral" className="h-11 gap-1 pr-1 pl-3">
              {chip.label}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${chip.label}`}
                onClick={() => onChange(chip.key === "archived" ? { archived: false } : { [chip.key]: undefined })}
              >
                <X />
              </Button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ q: undefined, kind: undefined, accountId: undefined, archived: false })}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
