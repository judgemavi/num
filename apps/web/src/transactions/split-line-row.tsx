import type { MoneyDirection } from "@num/shared";
import { Ellipsis, X } from "lucide-react";
import { accountLabel, accountOptionLabel } from "@/accounts/label";
import { useArchiveAccount } from "@/api/accounts";
import { useArchiveCategory } from "@/api/categories";
import { useStore } from "@tanstack/react-form";
import { useAccounts, useBookCurrency, useCategories } from "@/editors/lookups";
import { withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { formatMoney } from "@/money";
import { blankTransaction } from "@/transactions/transaction-draft";
import { ManagedPicker } from "@/editors/managed-picker";
import { CategoryForm } from "@/settings/category-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { categoryOptions } from "@/transactions/picker-options";
import { addedLine, editLineAmount, lineDirection, restOnLastLine, splitBlank, splitRemainder, type SplitLine } from "@/transactions/what-choice";

const categoryPrefix = "category:";
const accountPrefix = "account:";

type SplitLineRowProps = {
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

function SplitLineRow({
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
        <FieldLabel className={index === 0 ? undefined : "sr-only"} htmlFor={`txn-line-${index}-target`}>
          Category or account
        </FieldLabel>
        <ManagedPicker
          id={`txn-line-${index}-target`}
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
          <FieldLabel className="sr-only" htmlFor={`txn-line-${index}-amount`}>
            {`Amount of line ${index + 1}${line.opposite ? (direction === "out" ? ", money in" : ", money out") : ""}`}
          </FieldLabel>
          <Input
            id={`txn-line-${index}-amount`}
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

function splitStatus(currency: string, totalMilli: number | null, left: number | null, lines: SplitLine[]) {
  if (totalMilli === null) {
    return "Enter the amount.";
  }
  if (left === null) {
    return "Enter a positive amount on each line.";
  }
  if (left === 0) {
    return splitBlank(lines) ? "Enter an amount on each line." : "All assigned";
  }
  return left > 0 ? `${formatMoney(currency, left)} left` : `${formatMoney(currency, -left)} too much`;
}

/**
 * The lines of a split: a row for each line, "+ Add a line", and what is left. With two lines, one amount sets the
 * other. A new line starts with what is left.
 */
export const SplitLines = withForm({
  defaultValues: blankTransaction,
  props: { totalMilli: fieldValue<number | null>(null), categoryLocked: false, transferLocked: false, amountsLocked: false },
  render: function SplitLinesRender({ form, totalMilli, categoryLocked, transferLocked, amountsLocked }) {
    const currency = useBookCurrency();
    const direction = useStore(form.store, (state) => state.values.direction);
    const accountId = useStore(form.store, (state) => state.values.accountId);
    return (
      <form.Field name="lines">
        {(field) => {
          const lines = field.state.value;
          const change = field.handleChange;
          const left = totalMilli === null ? null : splitRemainder(currency, totalMilli, direction, lines);
          const lastLineRest = totalMilli === null ? null : restOnLastLine(currency, totalMilli, direction, lines);
          return (
            <div className="grid gap-3">
              {lines.map((line, index) => (
                <SplitLineRow
                  key={line.key}
                  index={index}
                  direction={direction}
                  line={line}
                  accountId={accountId}
                  categoryLocked={categoryLocked}
                  transferLocked={transferLocked}
                  amountsLocked={amountsLocked}
                  onChange={(patch) => change(lines.map((item) => (item.key === line.key ? { ...item, ...patch } : item)))}
                  onAmount={(text) => change(editLineAmount(currency, totalMilli, direction, lines, line.key, text))}
                  onRemove={lines.length > 1 && !amountsLocked ? () => change(lines.filter((item) => item.key !== line.key)) : null}
                />
              ))}
              {!amountsLocked ? (
                <Button type="button" variant="ghost" className="justify-start" onClick={() => change([...lines, addedLine(currency, totalMilli, direction, lines)])}>
                  + Add a line
                </Button>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2" role="status">
                <p className="text-sm font-semibold">{splitStatus(currency, totalMilli, left, lines)}</p>
                {!amountsLocked && left !== null && left !== 0 && lastLineRest !== null ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => change(lastLineRest)}>
                    Put it on the last line
                  </Button>
                ) : null}
              </div>
            </div>
          );
        }}
      </form.Field>
    );
  },
});
