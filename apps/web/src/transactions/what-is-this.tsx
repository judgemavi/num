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
import { useRestoreNamed } from "@/editors/restore-named";
import { InlineAccount, InlineCategory, InlineMerchant } from "@/editors/inline-records";
import { ManagedPicker } from "@/editors/managed-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/money";
import { type Option, type OptionGroup } from "@/transactions/option-combobox";
import { SplitLineRow } from "@/transactions/split-line-row";
import { RefundOfField } from "@/transactions/refund-of-field";
import { levelLabel } from "@/transactions/format";
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
  refundOfId?: string | null;
  onRefundOf?: (id: string | null) => void;
  linkedRefund?: { id: string; date: string; amount: number; payeeRaw: string } | null;
  asOf?: string;
  depth?: number;
};

function reasonText(reason: SuggestionReason): string {
  switch (reason) {
    case "recurring":
      return "Matches your recurring payment";
    case "learned_amount":
    case "learned_payee":
      return "You chose this for this payee";
    case "similar":
      return "Same as a similar payee";
    case "merchant_default":
      return "This merchant's usual category";
    case "refund_match":
      return "Same payee and amount as a purchase";
    case "refund_reversal":
      return "Same amount and category as a purchase";
    case "transfer_match":
      return "Same amount moved between your accounts";
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
  const label = suggestion.level === "none" ? null : levelLabel(suggestion.level);
  const text = `${parts.join(". ")}. ${reasonText(suggestion.reason)}`;
  return label ? `${label}. ${text}` : text;
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
  refundOfId = null,
  onRefundOf,
  linkedRefund = null,
  asOf = "",
  depth = 0,
}: WhatIsThisProps) {
  const restoreNamed = useRestoreNamed();
  const transferLabel = direction === "out" ? "To account" : "From account";
  const choices = choicesForDirection(direction, groupMode);
  const categoryList = categoryGroups(categories, choice, categoryId);
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, lines) : choice === "split" ? null : 0;
  const hint = suggestion && choice !== "transfer" ? suggestionText(suggestion, merchants, categories, accounts) : null;
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
      {choice === "refund" && onRefundOf && asOf.length > 0 ? (
        <RefundOfField
          id={`${idPrefix}-refund-of`}
          asOf={asOf}
          payee={payee}
          categoryName={categories.find((item) => item.id === categoryId)?.name ?? null}
          merchantName={merchants.find((item) => item.id === merchantId)?.label ?? null}
          value={refundOfId}
          currency={currency}
          linked={linkedRefund}
          onChange={onRefundOf}
          onCategory={onCategoryId}
          onMerchant={onMerchantId}
        />
      ) : null}
      {choice === "spending" || choice === "income" || (choice === "refund" && refundOfId === null) ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <ManagedPicker
            id={`${idPrefix}-category`}
            value={categoryId}
            options={categoryList.options}
            placeholder="Choose a category"
            emptyLabel={allowEmptyCategory ? "No category" : undefined}
            disabled={categoryLocked}
            noun="category"
            depth={depth}
            archived={archivedCategoryOptions}
            onRestore={(id) => restoreCategory(id, onCategoryId)}
            onChange={onCategoryId}
            renderForm={(name, finish) => (
              <InlineCategory name={name} kind={categoryKind ?? "expense"} depth={depth + 1} onDone={finish} />
            )}
          />
        </Field>
      ) : null}
      {choice === "transfer" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-transfer`}>{transferLabel}</FieldLabel>
          <ManagedPicker
            id={`${idPrefix}-transfer`}
            value={transferAccountId}
            options={accounts}
            placeholder="Choose an account"
            disabled={transferLocked}
            noun="account"
            depth={depth}
            archived={archivedAccounts}
            onRestore={(id) => restoreAccount(id, onTransferAccountId)}
            onChange={onTransferAccountId}
            renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
          />
        </Field>
      ) : null}
      {choice === "split" ? (
        <div className="grid gap-3">
          {lines.map((line, index) => (
            <SplitLineRow
              key={line.key}
              idPrefix={idPrefix}
              index={index}
              line={line}
              categoryGroups={categoryGroups(categories, "split", line.categoryId).groups ?? []}
              accounts={accounts}
              archivedCategories={archivedCategoryOptions}
              archivedAccounts={archivedAccounts}
              categoryLocked={categoryLocked}
              transferLocked={transferLocked}
              amountsLocked={amountsLocked}
              depth={depth}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={lines.length > 1 && !amountsLocked ? () => onLines(lines.filter((item) => item.key !== line.key)) : null}
              onRestoreCategory={(id) => restoreCategory(id, (restored) => updateLine(line.key, { categoryId: restored, transferAccountId: null }))}
              onRestoreAccount={(id) => restoreAccount(id, (restored) => updateLine(line.key, { transferAccountId: restored, categoryId: null }))}
            />
          ))}
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
      {choice === "transfer" || (choice === "refund" && refundOfId !== null) ? null : (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-merchant`}>Merchant</FieldLabel>
          <ManagedPicker
            id={`${idPrefix}-merchant`}
            value={merchantId}
            options={merchants}
            placeholder="No merchant"
            emptyLabel="No merchant"
            noun="merchant"
            depth={depth}
            suggestedName={suggestedMerchant}
            archived={archivedMerchants}
            onRestore={(id) => {
              void restoreNamed(`/api/merchants/${id}/restore`).then((restored) => {
                if (restored) {
                  onMerchantId(restored);
                }
              });
            }}
            onChange={onMerchantId}
            renderForm={(name, finish) => <InlineMerchant name={name} depth={depth + 1} categories={categories} onDone={finish} />}
          />
          {hint ? <FieldDescription role="status">{hint}</FieldDescription> : null}
        </Field>
      )}
    </div>
  );
}
