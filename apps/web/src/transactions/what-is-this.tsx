import { categoryKindForChoice, choicesForDirection, type MoneyDirection, type Suggestion, type WhatChoice } from "@num/shared";
import { choiceIn } from "@/components/choice";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { useAccountLabels, useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { AccountPicker, CategoryPicker, MerchantPicker } from "@/transactions/pickers";
import { SplitLineRow } from "@/transactions/split-line-row";
import { RefundOfField } from "@/transactions/refund-of-field";
import { levelLabel } from "@/transactions/format";
import { addedLine, editLineAmount, restOnLastLine, splitBlank, splitRemainder, type SplitLine } from "@/transactions/what-choice";

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
  totalMinor: number | null;
  /** The account of the transaction. A transfer goes to a different account. */
  accountId: string;
  merchantId: string | null;
  onMerchantId: (id: string | null) => void;
  payee: string;
  suggestion: Suggestion | null;
  refundOfId?: string | null;
  onRefundOf?: (id: string | null) => void;
  linkedRefund?: { id: string; date: string; amount: number; payeeRaw: string } | null;
  /** The date of the transaction. The purchases that a refund can link to are the purchases before this date. */
  date?: string;
};

function reasonText(suggestion: Suggestion) {
  switch (suggestion.reason) {
    case "recurring":
      return "Matches your recurring payment";
    case "learned_amount":
    case "learned_payee":
      return "You chose this for this payee";
    case "similar":
      return suggestion.sourceName ? `Same as ${suggestion.sourceName}` : "Same as a similar payee";
    case "family":
      return suggestion.sourceName ? `Same as other ${suggestion.sourceName} payees` : "Same as other payees of this brand";
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

/** The line under the merchant that tells what Num suggests and why. It shows only when a suggestion has a name to show. */
function SuggestionHint({ suggestion }: { suggestion: Suggestion }) {
  const merchant = useMerchantNames().get(suggestion.merchantId ?? "");
  const category = useCategoryNames().get(suggestion.categoryId ?? "");
  const account = useAccountLabels().get(suggestion.transferAccountId ?? "");
  const parts = [merchant ? `Merchant: ${merchant}` : null, category ? `Category: ${category}` : null, account ? `Transfer: ${account}` : null].filter(
    (part): part is string => part !== null,
  );
  if (suggestion.reason === "none" || parts.length === 0) {
    return null;
  }
  const label = suggestion.level === "none" ? null : levelLabel(suggestion.level);
  const text = `${parts.join(". ")}. ${reasonText(suggestion)}`;
  return <FieldDescription role="status">{label ? `${label}. ${text}` : text}</FieldDescription>;
}

function splitStatus(currency: string, totalMinor: number | null, left: number | null, lines: SplitLine[]) {
  if (totalMinor === null) {
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
  totalMinor,
  accountId,
  merchantId,
  onMerchantId,
  payee,
  suggestion,
  refundOfId = null,
  onRefundOf,
  linkedRefund = null,
  date = "",
}: WhatIsThisProps) {
  const currency = useBookCurrency();
  const transferLabel = direction === "out" ? "To account" : "From account";
  const choices = choicesForDirection(direction, groupMode);
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, direction, lines) : choice === "split" ? null : 0;
  const lastLineRest = choice === "split" && totalMinor !== null ? restOnLastLine(currency, totalMinor, direction, lines) : null;
  const categoryKind = categoryKindForChoice(choice);

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
            const next = choiceIn(choices, value);
            if (next) {
              onChoice(next);
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
      {choice === "refund" && onRefundOf && date.length > 0 ? (
        <RefundOfField
          id={`${idPrefix}-refund-of`}
          date={date}
          payee={payee}
          categoryId={categoryId}
          merchantId={merchantId}
          value={refundOfId}
          linked={linkedRefund}
          onChange={onRefundOf}
          onCategory={onCategoryId}
          onMerchant={onMerchantId}
        />
      ) : null}
      {categoryKind !== null && (choice !== "refund" || refundOfId === null) ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <CategoryPicker
            id={`${idPrefix}-category`}
            value={categoryId}
            kind={categoryKind}
            allowEmpty={allowEmptyCategory}
            disabled={categoryLocked}
            onChange={onCategoryId}
          />
        </Field>
      ) : null}
      {choice === "transfer" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-transfer`}>{transferLabel}</FieldLabel>
          <AccountPicker
            id={`${idPrefix}-transfer`}
            value={transferAccountId}
            exceptId={accountId}
            disabled={transferLocked}
            onChange={onTransferAccountId}
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
              direction={direction}
              line={line}
              accountId={accountId}
              categoryLocked={categoryLocked}
              transferLocked={transferLocked}
              amountsLocked={amountsLocked}
              onChange={(patch) => updateLine(line.key, patch)}
              onAmount={(text) => onLines(editLineAmount(currency, totalMinor, direction, lines, line.key, text))}
              onRemove={lines.length > 1 && !amountsLocked ? () => onLines(lines.filter((item) => item.key !== line.key)) : null}
            />
          ))}
          {!amountsLocked ? (
            <Button type="button" variant="ghost" className="justify-start" onClick={() => onLines([...lines, addedLine(currency, totalMinor, direction, lines)])}>
              + Add a line
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2" role="status">
            <p className="text-sm font-semibold">{splitStatus(currency, totalMinor, left, lines)}</p>
            {!amountsLocked && totalMinor !== null && left !== null && left !== 0 && lastLineRest !== null ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onLines(lastLineRest)}>
                Put it on the last line
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {choice === "transfer" || (choice === "refund" && refundOfId !== null) ? null : (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-merchant`}>Merchant</FieldLabel>
          <MerchantPicker id={`${idPrefix}-merchant`} value={merchantId} payee={payee} onChange={onMerchantId} />
          {suggestion ? <SuggestionHint suggestion={suggestion} /> : null}
        </Field>
      )}
    </div>
  );
}
