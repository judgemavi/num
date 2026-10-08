import {
  fromMinorUnits,
  moneyDirection,
  signedAmount,
  toMinorUnits,
  transactionSchema,
  type Account,
  type Category,
  type InboxItem,
  type Merchant,
  type Transaction,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { saveUncategorized } from "@/inbox/actions";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/request";
import { splitRemainder, type SplitLine, type WhatChoice } from "@/transactions/what-choice";
import { WhatIsThis } from "@/transactions/what-is-this";

type UncategorizedEditorProps = {
  item: Extract<InboxItem, { kind: "uncategorized" }>;
  currency: string;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onMore: () => void;
  onDone: () => void;
  onError: (code: string) => void;
};

function positive(currency: string, text: string): number {
  const minor = toMinorUnits(currency, text.trim());
  if (minor < 0) {
    throw new Error("Enter a positive amount.");
  }
  return minor;
}

function EditorBody({
  item,
  currency,
  txn,
  accounts,
  categories,
  merchants,
  onMore,
  onDone,
  onError,
}: UncategorizedEditorProps & { txn: Transaction }) {
  const direction = moneyDirection(txn.amount);
  const reconciled = txn.status === "reconciled";
  const suggestion = item.suggestion.reason === "none" ? null : item.suggestion;
  const line = txn.lines.find((itemLine) => itemLine.id === item.lineId) ?? txn.lines[0];
  const initialChoice: WhatChoice =
    txn.lines.length > 1
      ? "split"
      : line?.transferAccountId
        ? "transfer"
        : !reconciled && suggestion?.transferAccountId
          ? "transfer"
          : "spending";
  const [choice, setChoice] = useState<WhatChoice>(initialChoice);
  const [categoryId, setCategoryId] = useState<string | null>(line?.categoryId ?? suggestion?.categoryId ?? null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(
    line?.transferAccountId ?? suggestion?.transferAccountId ?? null,
  );
  const [merchantId, setMerchantId] = useState<string | null>(txn.merchantId ?? suggestion?.merchantId ?? null);
  const [lines, setLines] = useState<SplitLine[]>(() =>
    txn.lines.length > 1
      ? txn.lines.map((itemLine) => ({
          key: itemLine.id,
          amount: fromMinorUnits(currency, Math.abs(itemLine.amount)),
          direction: moneyDirection(itemLine.amount),
          categoryId: itemLine.categoryId,
          transferAccountId: itemLine.transferAccountId,
        }))
      : [
          {
            key: crypto.randomUUID(),
            amount: fromMinorUnits(currency, Math.abs(txn.amount)),
            direction,
            categoryId: line?.categoryId ?? suggestion?.categoryId ?? null,
            transferAccountId: null,
          },
          { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null },
        ],
  );
  const [pending, setPending] = useState(false);
  const accountOptions = accounts
    .filter((account) => account.id !== txn.accountId && account.archivedAt === null)
    .map((account) => ({ id: account.id, label: account.name }));
  const merchantOptions = merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }));
  const left = choice === "split" ? splitRemainder(currency, txn.amount, lines) : 0;
  const disabled =
    (choice === "spending" && !categoryId) || (choice === "transfer" && !transferAccountId) || (choice === "split" && left !== 0);

  function choose(next: WhatChoice) {
    setChoice(next);
    if (next === "split" && lines.length < 2) {
      setLines([
        {
          key: crypto.randomUUID(),
          amount: fromMinorUnits(currency, Math.abs(txn.amount)),
          direction,
          categoryId,
          transferAccountId: null,
        },
        { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null },
      ]);
    }
  }

  async function save() {
    setPending(true);
    const built =
      choice === "split"
        ? lines.map((itemLine) => ({
            amount: signedAmount(itemLine.direction, positive(currency, itemLine.amount)),
            memo: null,
            categoryId: itemLine.categoryId,
            transferAccountId: itemLine.transferAccountId,
            tagIds: line?.tagIds ?? [],
          }))
        : txn.lines.map((itemLine) =>
            itemLine.id === item.lineId
              ? {
                  amount: itemLine.amount,
                  memo: itemLine.memo,
                  categoryId: choice === "spending" ? categoryId : null,
                  transferAccountId: choice === "transfer" ? transferAccountId : null,
                  tagIds: itemLine.tagIds,
                }
              : {
                  amount: itemLine.amount,
                  memo: itemLine.memo,
                  categoryId: itemLine.categoryId,
                  transferAccountId: itemLine.transferAccountId,
                  tagIds: itemLine.tagIds,
                },
          );
    const result = await saveUncategorized(txn.id, merchantId, built);
    setPending(false);
    if (!result.ok) {
      onError(result.code);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-3 grid max-w-xl gap-3 pl-13">
      <WhatIsThis
        idPrefix={`inbox-${item.lineId}`}
        direction={direction}
        choice={choice}
        onChoice={choose}
        choiceLocked={reconciled}
        categoryId={categoryId}
        onCategoryId={setCategoryId}
        categoryLocked={false}
        allowEmptyCategory={false}
        transferAccountId={transferAccountId}
        onTransferAccountId={setTransferAccountId}
        transferLocked={reconciled}
        lines={lines}
        onLines={setLines}
        amountsLocked={reconciled}
        currency={currency}
        totalMinor={txn.amount}
        categories={categories}
        accounts={accountOptions}
        merchants={merchantOptions}
        merchantId={merchantId}
        onMerchantId={setMerchantId}
        suggestion={suggestion}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending || disabled} onClick={() => void save()}>
          {pending ? "Saving" : "Save"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onMore}>
          More…
        </Button>
      </div>
    </div>
  );
}

export function UncategorizedEditor(props: UncategorizedEditorProps) {
  const txn = useQuery({
    queryKey: ["transaction", props.item.transactionId],
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions/${props.item.transactionId}`, transactionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  if (txn.isPending) {
    return <p className="mt-3 pl-13 text-sm text-muted-foreground">Loading the transaction.</p>;
  }
  if (txn.isError || !txn.data) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 pl-13">
        <Button type="button" variant="outline" onClick={props.onMore}>
          More…
        </Button>
      </div>
    );
  }
  return <EditorBody key={txn.data.id} {...props} txn={txn.data} />;
}
