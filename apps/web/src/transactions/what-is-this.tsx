import { type Category, type MoneyDirection, type Suggestion, type SuggestionReason } from "@num/shared";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/money";
import { OptionCombobox, type Option } from "@/transactions/option-combobox";
import { splitRemainder, type SplitLine, type WhatChoice } from "@/transactions/what-choice";

type WhatIsThisProps = {
  idPrefix: string;
  direction: MoneyDirection;
  choice: WhatChoice;
  onChoice: (choice: WhatChoice) => void;
  choiceLocked: boolean;
  categoryId: string | null;
  onCategoryId: (id: string | null) => void;
  categoryLocked: boolean;
  allowEmptyCategory: boolean;
  transferAccountId: string | null;
  onTransferAccountId: (id: string | null) => void;
  transferLocked: boolean;
  lines: SplitLine[];
  onLines: (lines: SplitLine[]) => void;
  amountsLocked: boolean;
  currency: string;
  totalMinor: number | null;
  categories: Category[];
  accounts: Option[];
  merchants: Option[];
  merchantId: string | null;
  onMerchantId: (id: string | null) => void;
  suggestion: Suggestion | null;
};

function reasonText(reason: SuggestionReason): string {
  switch (reason) {
    case "rule":
      return "This comes from a rule.";
    case "payee_history":
      return "This comes from past transactions.";
    case "merchant_default":
      return "This comes from the merchant.";
    case "none":
      return "";
  }
}

function categoryOptions(categories: Category[], direction: MoneyDirection, selected: string | null): Option[] {
  const first = direction === "in" ? "income" : "expense";
  return categories
    .filter((category) => category.archivedAt === null || category.id === selected)
    .sort((left, right) => {
      const rank = (kind: string) => (kind === first ? 0 : 1);
      const byKind = rank(left.kind) - rank(right.kind);
      if (byKind !== 0) {
        return byKind;
      }
      return left.name.localeCompare(right.name);
    })
    .map((category) => ({
      id: category.id,
      label: category.archivedAt ? `${category.name} (archived)` : category.name,
    }));
}

function suggestionText(suggestion: Suggestion, merchants: Option[], categories: Category[], accounts: Option[]): string | null {
  if (suggestion.reason === "none") {
    return null;
  }
  const merchant = merchants.find((item) => item.id === suggestion.merchantId)?.label;
  const category = categories.find((item) => item.id === suggestion.categoryId)?.name;
  const account = accounts.find((item) => item.id === suggestion.transferAccountId)?.label;
  const parts = [
    merchant ? `Merchant: ${merchant}` : null,
    category ? `Category: ${category}` : null,
    account ? `Transfer: ${account}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return null;
  }
  return `Suggested. ${parts.join(". ")}. ${reasonText(suggestion.reason)}`;
}

export function WhatIsThis({
  idPrefix,
  direction,
  choice,
  onChoice,
  choiceLocked,
  categoryId,
  onCategoryId,
  categoryLocked,
  allowEmptyCategory,
  transferAccountId,
  onTransferAccountId,
  transferLocked,
  lines,
  onLines,
  amountsLocked,
  currency,
  totalMinor,
  categories,
  accounts,
  merchants,
  merchantId,
  onMerchantId,
  suggestion,
}: WhatIsThisProps) {
  const transferLabel = direction === "out" ? "To account" : "From account";
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, lines) : choice === "split" ? null : 0;
  const hint = suggestion ? suggestionText(suggestion, merchants, categories, accounts) : null;

  function updateLine(key: string, patch: Partial<SplitLine>) {
    onLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel>What is this?</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={choice}
          disabled={choiceLocked}
          onValueChange={(value) => {
            if (value === "spending" || value === "transfer" || value === "split") {
              onChoice(value);
            }
          }}
        >
          <ToggleGroupItem value="spending">Spending or income</ToggleGroupItem>
          <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
          <ToggleGroupItem value="split">Split</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {choice === "spending" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <OptionCombobox
            id={`${idPrefix}-category`}
            value={categoryId}
            options={categoryOptions(categories, direction, categoryId)}
            placeholder="Choose a category"
            emptyLabel={allowEmptyCategory ? "No category" : undefined}
            disabled={categoryLocked}
            onChange={onCategoryId}
          />
        </Field>
      ) : null}
      {choice === "transfer" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-transfer`}>{transferLabel}</FieldLabel>
          <OptionCombobox
            id={`${idPrefix}-transfer`}
            value={transferAccountId}
            options={accounts}
            placeholder={`Choose an account`}
            disabled={transferLocked}
            onChange={onTransferAccountId}
          />
        </Field>
      ) : null}
      {choice === "split" ? (
        <div className="grid gap-3">
          {lines.map((line, index) => (
            <div key={line.key} className="grid gap-3 sm:grid-cols-[auto_8rem_1fr_1fr]">
              <Field>
                <FieldLabel>Line {index + 1}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={line.direction}
                  disabled={amountsLocked}
                  onValueChange={(value) => {
                    if (value === "out" || value === "in") {
                      updateLine(line.key, { direction: value });
                    }
                  }}
                >
                  <ToggleGroupItem value="out">Money out</ToggleGroupItem>
                  <ToggleGroupItem value="in">Money in</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-line-${index}-amount`}>Amount</FieldLabel>
                <Input
                  id={`${idPrefix}-line-${index}-amount`}
                  inputMode="decimal"
                  value={line.amount}
                  disabled={amountsLocked}
                  onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-line-${index}-category`}>Category</FieldLabel>
                <OptionCombobox
                  id={`${idPrefix}-line-${index}-category`}
                  value={line.categoryId}
                  options={categoryOptions(categories, line.direction, line.categoryId)}
                  placeholder="Category"
                  emptyLabel="No category"
                  disabled={categoryLocked}
                  onChange={(id) => updateLine(line.key, { categoryId: id, transferAccountId: id ? null : line.transferAccountId })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-line-${index}-account`}>Account</FieldLabel>
                <OptionCombobox
                  id={`${idPrefix}-line-${index}-account`}
                  value={line.transferAccountId}
                  options={accounts}
                  placeholder="Account"
                  emptyLabel="No account"
                  disabled={transferLocked || amountsLocked}
                  onChange={(id) => updateLine(line.key, { transferAccountId: id, categoryId: id ? null : line.categoryId })}
                />
              </Field>
              {lines.length > 1 && !amountsLocked ? (
                <Button type="button" variant="outline" className="sm:col-span-4" onClick={() => onLines(lines.filter((item) => item.key !== line.key))}>
                  Remove line
                </Button>
              ) : null}
            </div>
          ))}
          {!amountsLocked ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onLines([...lines, { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null }])
              }
            >
              Add a line
            </Button>
          ) : null}
          <p className="text-sm font-semibold" role="status">
            {totalMinor === null
              ? "Enter the amount."
              : left === null
                ? "Enter a positive amount on each line."
                : `${formatMoney(currency, left)} left to assign`}
          </p>
        </div>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-merchant`}>Merchant</FieldLabel>
        <OptionCombobox
          id={`${idPrefix}-merchant`}
          value={merchantId}
          options={merchants}
          placeholder="No merchant"
          emptyLabel="No merchant"
          onChange={onMerchantId}
        />
        {hint ? <FieldDescription role="status">{hint}</FieldDescription> : null}
      </Field>
    </div>
  );
}
