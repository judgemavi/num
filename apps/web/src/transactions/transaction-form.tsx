import {
  fromMinorUnits,
  moneyDirection,
  signedAmount,
  suggestionSchema,
  Temporal,
  toMinorUnits,
  transactionCreateSchema,
  transactionSchema,
  transactionUpdateSchema,
  type Account,
  type Category,
  type Merchant,
  type MoneyDirection,
  type Tag,
  type Transaction,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { formatMoney } from "@/money";
import { formatDate, transactionError } from "@/transactions/format";
import { DeleteMenu, MoneySection, MoreDetails } from "@/transactions/transaction-parts";
import { splitRemainder, type SplitLine, type WhatChoice } from "@/transactions/what-choice";
import { WhatIsThis } from "@/transactions/what-is-this";

type TransactionFormProps = {
  currency: string;
  transaction: Transaction | null;
  amountLocked: boolean;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  merchants: Merchant[];
  rawLine?: string;
  initialAccountId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDelete: () => Promise<string | null>;
  deleteKind?: "plain" | "mirror" | "linked";
};

function readPositive(currency: string, text: string): number {
  let minor: number;
  try {
    minor = toMinorUnits(currency, text.trim());
  } catch (error) {
    if (error instanceof Error && error.message === "Amount has too many decimal places") {
      throw new Error("The amount has too many decimal places.");
    }
    throw new Error("Enter the amount as a number.");
  }
  if (minor < 0) {
    throw new Error("Enter a positive amount.");
  }
  return minor;
}

function choiceOf(transaction: Transaction | null): WhatChoice {
  if (!transaction) {
    return "spending";
  }
  if (transaction.lines.length > 1) {
    return "split";
  }
  return transaction.lines[0]?.transferAccountId ? "transfer" : "spending";
}

function linesOf(currency: string, transaction: Transaction | null, amountText: string, direction: MoneyDirection): SplitLine[] {
  if (transaction && transaction.lines.length > 1) {
    return transaction.lines.map((line) => ({
      key: line.id,
      amount: fromMinorUnits(currency, Math.abs(line.amount)),
      direction: moneyDirection(line.amount),
      categoryId: line.categoryId,
      transferAccountId: line.transferAccountId,
    }));
  }
  const first = transaction?.lines[0];
  return [
    {
      key: first?.id ?? crypto.randomUUID(),
      amount: amountText,
      direction,
      categoryId: first?.categoryId ?? null,
      transferAccountId: null,
    },
    { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null },
  ];
}

export function TransactionForm({
  currency,
  transaction,
  amountLocked,
  accounts,
  categories,
  tags,
  merchants,
  rawLine,
  initialAccountId,
  onClose,
  onSaved,
  onDelete,
  deleteKind = "plain",
}: TransactionFormProps) {
  const reconciled = transaction?.status === "reconciled";
  const imported = transaction?.source === "import";
  const moneyLocked = reconciled || amountLocked || imported;
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? initialAccountId ?? accounts.find((item) => !item.archivedAt)?.id ?? "",
  );
  const [date, setDate] = useState(transaction?.date ?? Temporal.Now.plainDateISO().toString());
  const [direction, setDirection] = useState<MoneyDirection>(transaction ? moneyDirection(transaction.amount) : "out");
  const [amount, setAmount] = useState(transaction ? fromMinorUnits(currency, Math.abs(transaction.amount)) : "");
  const [payee, setPayee] = useState(transaction?.payeeRaw ?? "");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [cleared, setCleared] = useState(transaction?.status === "cleared" || transaction?.status === "reconciled");
  const [merchantId, setMerchantId] = useState<string | null>(transaction?.merchantId ?? null);
  const [choice, setChoice] = useState<WhatChoice>(choiceOf(transaction));
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.lines[0]?.categoryId ?? null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(transaction?.lines[0]?.transferAccountId ?? null);
  const [lines, setLines] = useState<SplitLine[]>(() =>
    transaction && transaction.lines.length > 1
      ? linesOf(currency, transaction, fromMinorUnits(currency, Math.abs(transaction.amount)), moneyDirection(transaction.amount))
      : [],
  );
  const [tagIds, setTagIds] = useState<string[]>(() => [...new Set(transaction?.lines.flatMap((line) => line.tagIds) ?? [])]);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(transaction !== null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestion = useQuery({
    queryKey: ["suggestion", accountId, payee],
    enabled: accountId.length > 0 && payee.trim().length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ accountId, payee });
      const result = await apiRequest(`/api/suggestions?${params.toString()}`, suggestionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const suggestionKey =
    suggestion.data && suggestion.data.reason !== "none"
      ? `${suggestion.data.transferAccountId ?? ""}|${suggestion.data.categoryId ?? ""}|${suggestion.data.merchantId ?? ""}`
      : null;
  const [seenSuggestion, setSeenSuggestion] = useState<string | null>(null);
  if (!touched && suggestionKey && suggestionKey !== seenSuggestion && suggestion.data) {
    setSeenSuggestion(suggestionKey);
    if (suggestion.data.transferAccountId) {
      setChoice("transfer");
      setTransferAccountId(suggestion.data.transferAccountId);
    } else if (suggestion.data.categoryId) {
      setChoice("spending");
      setCategoryId(suggestion.data.categoryId);
    }
    if (suggestion.data.merchantId) {
      setMerchantId(suggestion.data.merchantId);
    }
  }

  const accountName = accounts.find((item) => item.id === accountId)?.name ?? "Account";
  const accountOptions = accounts
    .filter((account) => account.archivedAt === null || account.id === accountId)
    .map((account) => ({ id: account.id, label: account.archivedAt ? `${account.name} (archived)` : account.name }));
  const transferOptions = accounts
    .filter((account) => account.id !== accountId && (account.archivedAt === null || account.id === transferAccountId || lines.some((line) => line.transferAccountId === account.id)))
    .map((account) => ({ id: account.id, label: account.archivedAt ? `${account.name} (archived)` : account.name }));
  const merchantOptions = merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }));
  const totalMinor = (() => {
    if (imported && transaction) {
      return transaction.amount;
    }
    if (amount.trim().length === 0) {
      return null;
    }
    try {
      return signedAmount(direction, readPositive(currency, amount));
    } catch {
      return null;
    }
  })();
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, lines) : null;
  const saveDisabled =
    saving ||
    accountId.length === 0 ||
    totalMinor === null ||
    (choice === "transfer" && !transferAccountId) ||
    (choice === "split" && left !== 0);

  function choose(next: WhatChoice) {
    setTouched(true);
    setChoice(next);
    if (next === "split") {
      setLines((current) =>
        current.length > 1
          ? current
          : [
              { key: crypto.randomUUID(), amount, direction, categoryId, transferAccountId: null },
              { key: crypto.randomUUID(), amount: "", direction, categoryId: null, transferAccountId: null },
            ],
      );
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (payee.trim().length === 0) {
      setError("Enter the bank text.");
      setMore(true);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Choose a date.");
      return;
    }
    if (totalMinor === null) {
      setError("Enter a positive amount.");
      return;
    }
    if (choice === "transfer" && !transferAccountId) {
      setError("Choose the other account.");
      return;
    }
    if (choice === "split" && left !== 0) {
      setError("Assign the whole amount.");
      return;
    }
    const memoAt = (index: number) => transaction?.lines[index]?.memo ?? null;
    let built;
    try {
      built =
        choice === "split"
          ? lines.map((line, index) => ({
              amount: signedAmount(line.direction, readPositive(currency, line.amount)),
              memo: memoAt(index),
              categoryId: line.categoryId,
              transferAccountId: line.transferAccountId,
              tagIds,
            }))
          : [
              {
                amount: totalMinor,
                memo: memoAt(0),
                categoryId: choice === "spending" ? categoryId : null,
                transferAccountId: choice === "transfer" ? transferAccountId : null,
                tagIds,
              },
            ];
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the transaction fields.");
      return;
    }
    const body = {
      accountId,
      date,
      amount: totalMinor,
      merchantId,
      notes: notes.trim().length === 0 ? null : notes.trim(),
      payeeRaw: payee.trim(),
      status: reconciled ? "open" : cleared ? "cleared" : "open",
      lines: built,
    };
    const parsed = (transaction ? transactionUpdateSchema : transactionCreateSchema).safeParse(body);
    if (!parsed.success) {
      setError("Check the transaction fields.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(transaction ? `/api/transactions/${transaction.id}` : "/api/transactions", transactionSchema, {
      method: transaction ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setSaving(false);
    if (!result.ok) {
      setError(transactionError(result.code));
      return;
    }
    onSaved(result.data.id);
  }

  const summary = `${formatDate(date)} · ${accountName} · ${direction === "out" ? "Money out" : "Money in"} ${formatMoney(currency, Math.abs(imported && transaction ? transaction.amount : (totalMinor ?? 0)))} · ${payee}`;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        <DialogDescription>
          {amountLocked ? "This side follows the other account. Change the amount there." : "Say where the money went."}
        </DialogDescription>
      </DialogHeader>
      {rawLine ? (
        <p className="rounded-xl bg-sunken px-3 py-2 text-sm break-all">
          <span className="font-semibold">Statement line. </span>
          {rawLine}
        </p>
      ) : null}
      {reconciled ? (
        <p role="status">This transaction is reconciled. Date, account, amount and transfer stay locked. Merchant, notes, category and tags can change.</p>
      ) : null}
      {imported ? (
        <p className="text-sm">{summary}</p>
      ) : (
        <MoneySection
          direction={direction}
          onDirection={setDirection}
          amount={amount}
          onAmount={setAmount}
          moneyLocked={moneyLocked}
          accountId={accountId}
          accountOptions={accountOptions}
          onAccount={(id) => {
            setAccountId(id);
            if (transferAccountId === id) {
              setTransferAccountId(null);
            }
          }}
          accountLocked={reconciled}
          date={date}
          onDate={setDate}
        />
      )}
      <WhatIsThis
        idPrefix="txn"
        direction={direction}
        choice={choice}
        onChoice={choose}
        choiceLocked={reconciled || amountLocked}
        categoryId={categoryId}
        onCategoryId={(id) => {
          setTouched(true);
          setCategoryId(id);
        }}
        categoryLocked={amountLocked}
        allowEmptyCategory
        transferAccountId={transferAccountId}
        onTransferAccountId={(id) => {
          setTouched(true);
          setTransferAccountId(id);
        }}
        transferLocked={reconciled || amountLocked}
        lines={lines}
        onLines={setLines}
        amountsLocked={reconciled || amountLocked}
        currency={currency}
        totalMinor={totalMinor}
        categories={categories}
        accounts={transferOptions}
        merchants={merchantOptions}
        merchantId={merchantId}
        onMerchantId={(id) => {
          setTouched(true);
          setMerchantId(id);
        }}
        suggestion={suggestion.data ?? null}
      />
      <MoreDetails
        open={more}
        onOpenChange={setMore}
        notes={notes}
        onNotes={setNotes}
        tags={tags}
        tagIds={tagIds}
        onTags={setTagIds}
        payee={payee}
        onPayee={setPayee}
        payeeLocked={imported}
        cleared={cleared}
        onCleared={setCleared}
        clearedLocked={reconciled}
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        {transaction && !reconciled ? (
          <DeleteMenu
            kind={deleteKind}
            onDelete={async () => {
              const message = await onDelete();
              if (message) {
                setError(message);
              }
            }}
          />
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveDisabled}>
          {saving ? "Saving" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
