import type { MoneyDirection } from "@num/shared";
import { Ellipsis, X } from "lucide-react";
import { accountLabel, accountOptionLabel } from "@/accounts/label";
import { useArchiveAccount } from "@/api/accounts";
import { useArchiveCategory } from "@/api/categories";
import { useAccounts, useCategories } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { CategoryForm } from "@/settings/category-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { categoryOptions } from "@/transactions/picker-options";
import { lineDirection, type SplitLine } from "@/transactions/what-choice";

const categoryPrefix = "category:";
const accountPrefix = "account:";

type SplitLineRowProps = {
  idPrefix: string;
  index: number;
  direction: MoneyDirection;
  line: SplitLine;
  /** The account of the transaction. A transfer line goes to a different account. */
  accountId: string;
  categoryLocked: boolean;
  transferLocked: boolean;
  amountsLocked: boolean;
  onChange: (patch: Partial<SplitLine>) => void;
  onAmount: (text: string) => void;
  onRemove: (() => void) | null;
};

function pickerValue(line: SplitLine) {
  if (line.categoryId) {
    return `${categoryPrefix}${line.categoryId}`;
  }
  return line.transferAccountId ? `${accountPrefix}${line.transferAccountId}` : null;
}

export function SplitLineRow({
  idPrefix,
  index,
  direction,
  line,
  accountId,
  categoryLocked,
  transferLocked,
  amountsLocked,
  onChange,
  onAmount,
  onRemove,
}: SplitLineRowProps) {
  const categories = useCategories();
  const accounts = useAccounts().filter((account) => account.id !== accountId);
  const archiveCategory = useArchiveCategory();
  const archiveAccount = useArchiveAccount();
  const isTransfer = line.transferAccountId !== null;
  const transferFrozen = transferLocked || amountsLocked;
  const allowTransfer = !transferFrozen || isTransfer;
  const disabled = isTransfer ? transferFrozen : line.categoryId ? categoryLocked : categoryLocked && !allowTransfer;
  const categoryGroup = (label: string, kind: "expense" | "income") => ({
    label,
    options: categoryOptions(categories, kind, line.categoryId).map((item) => ({ id: `${categoryPrefix}${item.id}`, label: item.label })),
  });
  const transferGroup = {
    label: "Transfer",
    options: accounts
      .filter((account) => account.archivedAt === null || account.id === line.transferAccountId)
      .map((account) => ({ id: `${accountPrefix}${account.id}`, label: `Transfer to ${accountOptionLabel(account)}` })),
  };
  const groups = [
    ...(isTransfer && transferFrozen ? [] : [categoryGroup("Spending", "expense"), categoryGroup("Income", "income")]),
    ...(allowTransfer ? [transferGroup] : []),
  ];
  const archived = [
    ...categories.filter((category) => category.archivedAt !== null).map((category) => ({ id: `${categoryPrefix}${category.id}`, label: category.name })),
    ...(allowTransfer ? accounts.filter((account) => account.archivedAt !== null).map((account) => ({ id: `${accountPrefix}${account.id}`, label: accountLabel(account) })) : []),
  ];

  function change(id: string | null) {
    if (id === null) {
      onChange({ categoryId: null, transferAccountId: null });
    } else if (id.startsWith(accountPrefix)) {
      onChange({ transferAccountId: id.slice(accountPrefix.length), categoryId: null });
    } else {
      onChange({ categoryId: id.slice(categoryPrefix.length), transferAccountId: null });
    }
  }

  function restore(id: string) {
    if (id.startsWith(accountPrefix)) {
      archiveAccount.mutate(
        { id: id.slice(accountPrefix.length), restore: true },
        { onSuccess: (restored) => onChange({ transferAccountId: restored.id, categoryId: null }) },
      );
    } else {
      archiveCategory.mutate(
        { id: id.slice(categoryPrefix.length), restore: true },
        { onSuccess: (restored) => onChange({ categoryId: restored.id, transferAccountId: null }) },
      );
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
      <Field className="basis-full sm:min-w-48 sm:flex-1 sm:basis-0">
        <FieldLabel className={index === 0 ? undefined : "sr-only"} htmlFor={`${idPrefix}-line-${index}-target`}>
          Category or account
        </FieldLabel>
        <ManagedPicker
          id={`${idPrefix}-line-${index}-target`}
          value={pickerValue(line)}
          options={[]}
          groups={groups}
          placeholder="Choose one"
          emptyLabel="No category"
          disabled={disabled}
          noun="category"
          archived={archived}
          onRestore={restore}
          onChange={change}
          createdId={(savedId) => `${categoryPrefix}${savedId}`}
          renderForm={(name) => <CategoryForm inline depth={1} category={null} initialName={name} initialKind="expense" />}
        />
      </Field>
      <div className="ml-auto flex items-center gap-1">
        {line.opposite ? (
          <span aria-hidden className="text-muted-foreground">
            {direction === "out" ? "+" : "\u2212"}
          </span>
        ) : null}
        <Field className="w-32">
          <FieldLabel className="sr-only" htmlFor={`${idPrefix}-line-${index}-amount`}>
            {`Amount of line ${index + 1}${line.opposite ? (direction === "out" ? ", money in" : ", money out") : ""}`}
          </FieldLabel>
          <Input
            id={`${idPrefix}-line-${index}-amount`}
            className="text-right"
            inputMode="decimal"
            value={line.amount}
            disabled={amountsLocked}
            onChange={(event) => onAmount(event.target.value)}
          />
        </Field>
        {amountsLocked ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Options for line ${index + 1}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onChange({ opposite: !line.opposite })}>
                {lineDirection(direction, line) === "out" ? "Money in on this line" : "Money out on this line"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onRemove ? (
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
            <X />
          </Button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>
    </div>
  );
}
