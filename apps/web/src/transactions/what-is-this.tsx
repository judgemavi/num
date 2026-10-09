import {
  categoryKindForChoice,
  choicesForDirection,
  merchantNameFromPayee,
  type Category,
  type CategoryKind,
  type MoneyDirection,
  type Suggestion,
  type SuggestionReason,
  type WhatChoice,
} from "@num/shared";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { useRestoreNamed } from "@/editors/restore-named";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/money";
import { OptionCombobox, type Option, type OptionGroup } from "@/transactions/option-combobox";
import { splitRemainder, type SplitLine } from "@/transactions/what-choice";

const choiceLabel: Record<WhatChoice, string> = {
  spending: "Spending",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  split: "Split",
};

type WhatIsThisProps = {
  idPrefix: string;
  direction: MoneyDirection;
  choice: WhatChoice;
  onChoice: (choice: WhatChoice) => void;
  choiceLocked: boolean;
  groupMode?: boolean;
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
  archivedAccounts?: Option[];
  merchants: Option[];
  archivedMerchants?: Option[];
  merchantId: string | null;
  onMerchantId: (id: string | null) => void;
  payee: string;
  suggestion: Suggestion | null;
};

function reasonText(reason: SuggestionReason): string {
  switch (reason) {
    case "recurring":
      return "This matches a recurring item.";
    case "learned_amount":
      return "This matches the payee and the amount.";
    case "learned_payee":
      return "This matches past answers for the payee.";
    case "similar":
      return "This looks like another payee.";
    case "merchant_default":
      return "This comes from the merchant.";
    case "none":
      return "";
  }
}

function named(categories: Category[], kind: CategoryKind, selected: string | null): Option[] {
  return categories
    .filter((category) => category.kind === kind && (category.archivedAt === null || category.id === selected))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ id: category.id, label: category.archivedAt ? `${category.name} (archived)` : category.name }));
}

function categoryGroups(categories: Category[], choice: WhatChoice, selected: string | null): { options: Option[]; groups?: OptionGroup[] } {
  if (choice === "split") {
    return {
      options: [],
      groups: [
        { label: "Spending", options: named(categories, "expense", selected) },
        { label: "Income", options: named(categories, "income", selected) },
      ],
    };
  }
  const kind = categoryKindForChoice(choice);
  return { options: kind ? named(categories, kind, selected) : [] };
}

function suggestionText(suggestion: Suggestion, merchants: Option[], categories: Category[], accounts: Option[]): string | null {
  if (suggestion.reason === "none") {
    return null;
  }
  const merchant = merchants.find((item) => item.id === suggestion.merchantId)?.label;
  const category = categories.find((item) => item.id === suggestion.categoryId)?.name;
  const account = accounts.find((item) => item.id === suggestion.transferAccountId)?.label;
  const parts = [merchant ? `Merchant: ${merchant}` : null, category ? `Category: ${category}` : null, account ? `Transfer: ${account}` : null].filter(
    (part): part is string => part !== null,
  );
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
  groupMode = false,
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
  archivedAccounts = [],
  merchants,
  archivedMerchants = [],
  merchantId,
  onMerchantId,
  payee,
  suggestion,
}: WhatIsThisProps) {
  const { openEditor } = useEditors();
  const restoreNamed = useRestoreNamed();
  const [extraMerchants, setExtraMerchants] = useState<Option[]>([]);
  const [extraCategories, setExtraCategories] = useState<Category[]>([]);
  const [extraAccounts, setExtraAccounts] = useState<Option[]>([]);
  const transferLabel = direction === "out" ? "To account" : "From account";
  const choices = choicesForDirection(direction, groupMode);
  const allCategories = [...categories, ...extraCategories.filter((item) => !categories.some((category) => category.id === item.id))];
  const categoryList = categoryGroups(allCategories, choice, categoryId);
  const merchantOptions = [...merchants, ...extraMerchants.filter((item) => !merchants.some((merchant) => merchant.id === item.id))];
  const accountOptions = [...accounts, ...extraAccounts.filter((item) => !accounts.some((account) => account.id === item.id))];
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, lines) : choice === "split" ? null : 0;
  const hint = suggestion && choice !== "transfer" ? suggestionText(suggestion, merchantOptions, allCategories, accountOptions) : null;
  const suggestedMerchant = merchantNameFromPayee(payee);
  const categoryKind = categoryKindForChoice(choice);
  const archivedCategoryOptions = categories
    .filter((category) => category.archivedAt !== null && (choice === "split" || category.kind === categoryKind))
    .map((category) => ({ id: category.id, label: category.name }));

  function restoreCategory(id: string, onPicked: (id: string) => void) {
    void restoreNamed(`/api/categories/${id}/restore`).then((restored) => {
      if (restored) {
        onPicked(restored);
      }
    });
  }

  function restoreAccount(id: string, onPicked: (id: string) => void) {
    void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
      if (restored) {
        onPicked(restored);
      }
    });
  }

  function updateLine(key: string, patch: Partial<SplitLine>) {
    onLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function createCategory(name: string, onPicked: (id: string) => void) {
    const kind = categoryKindForChoice(choice) ?? "expense";
    void openEditor("category", { id: null, name, kind }).then((id) => {
      if (!id) {
        return;
      }
      setExtraCategories((current) => [...current, { id, name, kind, groupId: null, essential: false, archivedAt: null }]);
      onPicked(id);
    });
  }

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel>What is this?</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={choices.includes(choice) ? choice : ""}
          disabled={choiceLocked}
          onValueChange={(value) => {
            if (choices.includes(value as WhatChoice)) {
              onChoice(value as WhatChoice);
            }
          }}
        >
          {choices.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {choiceLabel[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {choice === "spending" || choice === "income" || choice === "refund" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <OptionCombobox
            id={`${idPrefix}-category`}
            value={categoryId}
            options={categoryList.options}
            placeholder="Choose a category"
            emptyLabel={allowEmptyCategory ? "No category" : undefined}
            disabled={categoryLocked}
            create={{
              noun: "category",
              onCreate: (name) => createCategory(name, onCategoryId),
            }}
            archived={archivedCategoryOptions}
            onRestore={(id) => restoreCategory(id, onCategoryId)}
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
            options={accountOptions}
            placeholder="Choose an account"
            disabled={transferLocked}
            create={{
              noun: "account",
              onCreate: (name) => {
                void openEditor("account", { id: null, name }).then((id) => {
                  if (!id) {
                    return;
                  }
                  setExtraAccounts((current) => [...current, { id, label: name }]);
                  onTransferAccountId(id);
                });
              },
            }}
            archived={archivedAccounts}
            onRestore={(id) => restoreAccount(id, onTransferAccountId)}
            onChange={onTransferAccountId}
          />
        </Field>
      ) : null}
      {choice === "split" ? (
        <div className="grid gap-3">
          {lines.map((line, index) => {
            const lineCategories = categoryGroups(allCategories, "split", line.categoryId);
            return (
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
                    options={[]}
                    groups={lineCategories.groups}
                    placeholder="Category"
                    emptyLabel="No category"
                    disabled={categoryLocked}
                    create={{ noun: "category", onCreate: (name) => createCategory(name, (id) => updateLine(line.key, { categoryId: id, transferAccountId: null })) }}
                    archived={archivedCategoryOptions}
                    onRestore={(id) => restoreCategory(id, (restored) => updateLine(line.key, { categoryId: restored, transferAccountId: null }))}
                    onChange={(id) => updateLine(line.key, { categoryId: id, transferAccountId: id ? null : line.transferAccountId })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-line-${index}-account`}>Account</FieldLabel>
                  <OptionCombobox
                    id={`${idPrefix}-line-${index}-account`}
                    value={line.transferAccountId}
                    options={accountOptions}
                    placeholder="Account"
                    emptyLabel="No account"
                    disabled={transferLocked || amountsLocked}
                    create={{
                      noun: "account",
                      onCreate: (name) => {
                        void openEditor("account", { id: null, name }).then((id) => {
                          if (!id) {
                            return;
                          }
                          setExtraAccounts((current) => [...current, { id, label: name }]);
                          updateLine(line.key, { transferAccountId: id, categoryId: null });
                        });
                      },
                    }}
                    archived={archivedAccounts}
                    onRestore={(id) => restoreAccount(id, (restored) => updateLine(line.key, { transferAccountId: restored, categoryId: null }))}
                    onChange={(id) => updateLine(line.key, { transferAccountId: id, categoryId: id ? null : line.categoryId })}
                  />
                </Field>
                {lines.length > 1 && !amountsLocked ? (
                  <Button type="button" variant="outline" className="sm:col-span-4" onClick={() => onLines(lines.filter((item) => item.key !== line.key))}>
                    Remove line
                  </Button>
                ) : null}
              </div>
            );
          })}
          {!amountsLocked ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onLines([...lines, { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null }])}
            >
              Add a line
            </Button>
          ) : null}
          <p className="text-sm font-semibold" role="status">
            {totalMinor === null ? "Enter the amount." : left === null ? "Enter a positive amount on each line." : `${formatMoney(currency, left)} left to assign`}
          </p>
        </div>
      ) : null}
      {choice === "transfer" ? null : (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-merchant`}>Merchant</FieldLabel>
          <OptionCombobox
            id={`${idPrefix}-merchant`}
            value={merchantId}
            options={merchantOptions}
            placeholder="No merchant"
            emptyLabel="No merchant"
            create={{
              noun: "merchant",
              suggestedName: suggestedMerchant,
              onCreate: (name) => {
                void openEditor("merchant", { id: null, name }).then((id) => {
                  if (!id) {
                    return;
                  }
                  setExtraMerchants((current) => [...current, { id, label: name }]);
                  onMerchantId(id);
                });
              },
            }}
            archived={archivedMerchants}
            onRestore={(id) => {
              void restoreNamed(`/api/merchants/${id}/restore`).then((restored) => {
                if (restored) {
                  onMerchantId(restored);
                }
              });
            }}
            onChange={onMerchantId}
          />
          {hint ? <FieldDescription role="status">{hint}</FieldDescription> : null}
        </Field>
      )}
    </div>
  );
}
