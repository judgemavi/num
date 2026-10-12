import {
  categoryKindForChoice,
  choicesForDirection,
  defaultChoice,
  fromMinorUnits,
  merchantForChoice,
  moneyDirection,
  Temporal,
  transactionSchema,
  type MoneyDirection,
  type WhatChoice,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { FieldError } from "@/components/ui/field";
import { accountLabel, accountOptionLabel } from "@/accounts/label";
import { formatMoney } from "@/money";
import { inboxError } from "@/review/format";
import { formatDate, refundedText, transactionError } from "@/transactions/format";
import { MortgageSplitWatch } from "@/transactions/mortgage-split-watch";
import { AutomaticReason, DeleteMenu, MoneySection, MoreDetails, type TransactionFormProps } from "@/transactions/transaction-parts";
import { alreadyChosen, choiceOf, linesOf, signedTotal, useApplySuggestion } from "@/transactions/transaction-draft";
import { submitTransaction } from "@/transactions/transaction-submit";
import { merchantOptionLists } from "@/transactions/merchant-options";
import { splitRemainder, type SplitLine } from "@/transactions/what-choice";
import { WhatIsThis } from "@/transactions/what-is-this";

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
  unreadableItemKey,
  onSaved,
  onDelete,
  deleteKind = "plain",
  decisions = [],
  onUndoDecision,
}: TransactionFormProps) {
  const reconciled = transaction?.reconciled === true;
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
  const [cleared, setCleared] = useState(transaction?.status === "cleared");
  const [merchantId, setMerchantId] = useState<string | null>(transaction?.merchantId ?? null);
  const [refundOfId, setRefundOfId] = useState<string | null>(transaction?.refundOfId ?? null);
  const [choice, setChoice] = useState<WhatChoice>(choiceOf(transaction, categories));
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.lines[0]?.categoryId ?? null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(transaction?.lines[0]?.transferAccountId ?? null);
  const [linesEdited, setLinesEdited] = useState(
    () => transaction !== null && (transaction.lines.length > 1 || transaction.lines.some((line) => line.categoryId !== null || line.transferAccountId !== null)),
  );
  const [lines, setLines] = useState<SplitLine[]>(() =>
    transaction && transaction.lines.length > 1
      ? linesOf(currency, transaction, fromMinorUnits(currency, Math.abs(transaction.amount)), moneyDirection(transaction.amount))
      : [],
  );
  const [tagIds, setTagIds] = useState<string[]>(() => [...new Set(transaction?.lines.flatMap((line) => line.tagIds) ?? [])]);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(alreadyChosen(transaction));
  const [error, setError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hintAmount = signedTotal(currency, imported, transaction, amount, direction);
  const suggestion = useApplySuggestion({
    accountId,
    payee,
    date,
    direction,
    amount: hintAmount,
    touched,
    categories,
    setChoice,
    setCategoryId,
    setTransferAccountId,
    setMerchantId,
  });

  const accountName = accountLabel(accounts.find((item) => item.id === accountId) ?? { name: "Account" });
  const accountOptions = accounts
    .filter((account) => account.archivedAt === null || account.id === accountId)
    .map((account) => ({ id: account.id, label: accountOptionLabel(account) }));
  const transferOptions = accounts
    .filter((account) => account.id !== accountId && (account.archivedAt === null || account.id === transferAccountId || lines.some((line) => line.transferAccountId === account.id)))
    .map((account) => ({ id: account.id, label: accountOptionLabel(account) }));
  const { merchantOptions, archivedMerchants } = merchantOptionLists(merchants, merchantId);
  const archivedAccounts = accounts
    .filter((account) => account.archivedAt !== null && account.id !== accountId)
    .map((account) => ({ id: account.id, label: accountLabel(account) }));
  const totalMinor = hintAmount;
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
    setMerchantId((current) => merchantForChoice(next, current));
    if (next !== "refund") {
      setRefundOfId(null);
    }
    if (next !== "transfer" && next !== "split") {
      const kind = categories.find((category) => category.id === categoryId)?.kind ?? null;
      if (kind && kind !== categoryKindForChoice(next)) {
        setCategoryId(null);
      }
    }
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
    setSaving(true);
    const result = await submitTransaction({
      currency,
      transaction,
      reconciled,
      accountId,
      date,
      totalMinor,
      payee,
      notes,
      cleared,
      merchantId,
      choice,
      categoryId,
      transferAccountId,
      lines,
      tagIds,
      refundOfId,
      unreadableItemKey,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.skipped > 0) {
      setNotice(`Applied to ${result.applied} · skipped ${result.skipped}`);
      setSavedId(result.id);
      return;
    }
    onSaved(result.id);
  }
  async function markRight() {
    if (!transaction) return;
    setSaving(true);
    const result = await apiRequest(`/api/transactions/${transaction.id}/looks-right`, transactionSchema, { method: "POST" });
    setSaving(false);
    if (!result.ok) {
      setError(transactionError(result.code));
      return;
    }
    onSaved(result.data.id);
  }
  const summary = `${formatDate(date)} · ${accountName} · ${direction === "out" ? "Money out" : "Money in"} ${formatMoney(currency, Math.abs(imported && transaction ? transaction.amount : (totalMinor ?? 0)))} · ${payee}`;

  return (
    <DialogForm onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        <DialogDescription>
          {amountLocked ? "This side follows the other account. Change the amount there." : "Say where the money went."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
      {decisions.map((row) => (
        <p key={row.itemKey} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{row.text}</span>
          {onUndoDecision ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void onUndoDecision(row.itemKey).then((result) => {
                  if (!result.ok) {
                    setUndoError(inboxError(result.code ?? "internal_error"));
                    return;
                  }
                  setUndoError(null);
                });
              }}
            >
              Undo
            </Button>
          ) : null}
        </p>
      ))}
      {undoError ? (
        <p role="alert" className="text-sm text-attn">
          {undoError}
        </p>
      ) : null}
      {rawLine ? (
        <p className="rounded-xl bg-sunken px-3 py-2 text-sm break-all">
          <span className="font-semibold">Statement line. </span>
          {rawLine}
        </p>
      ) : null}
      {reconciled ? (
        <p role="status">This transaction is reconciled. Date, account, amount and transfer stay locked. Merchant, notes, category and tags can change.</p>
      ) : null}
      {transaction?.autoReason ? (
        <AutomaticReason transaction={{ ...transaction, autoReason: transaction.autoReason }} saving={saving} onLooksRight={() => void markRight()} />
      ) : null}
      {imported ? (
        <p className="text-sm">{summary}</p>
      ) : (
        <MoneySection
          direction={direction}
          onDirection={(next) => {
            setDirection(next);
            if (!choicesForDirection(next).includes(choice)) {
              setChoice(defaultChoice(next));
              setCategoryId(null);
              setMerchantId((current) => merchantForChoice(defaultChoice(next), current));
            }
          }}
          amount={amount}
          onAmount={setAmount}
          moneyLocked={moneyLocked}
          accountId={accountId}
          accountOptions={accountOptions}
          archivedAccounts={archivedAccounts}
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
      <MortgageSplitWatch
        enabled={!reconciled && !linesEdited}
        edited={linesEdited}
        choice={choice}
        fromAccountId={accountId}
        toAccountId={transferAccountId}
        date={date}
        direction={direction}
        currency={currency}
        amount={amount}
        onPrefill={(prefill) => {
          setChoice("split");
          setLines(prefill.lines);
          if (!transaction && prefill.total !== null) {
            setAmount(prefill.total);
          }
          setNotice("Num put the principal and interest from the schedule in the lines. You can change the amounts.");
        }}
      />
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
        onLines={(next) => {
          setLinesEdited(true);
          setLines(next);
        }}
        amountsLocked={reconciled || amountLocked}
        currency={currency}
        totalMinor={totalMinor}
        categories={categories}
        accounts={transferOptions}
        archivedAccounts={archivedAccounts}
        merchants={merchantOptions}
        archivedMerchants={archivedMerchants}
        merchantId={merchantId}
        onMerchantId={(id) => {
          setTouched(true);
          setMerchantId(id);
        }}
        payee={payee}
        suggestion={suggestion}
        refundOfId={refundOfId}
        onRefundOf={(id) => {
          setTouched(true);
          setRefundOfId(id);
        }}
        linkedRefund={refundOfId !== null && transaction?.refundOf?.id === refundOfId ? transaction.refundOf : null}
        asOf={date}
      />
      {transaction?.refundedAmount ? <p className="text-sm text-muted-foreground">{refundedText(currency, transaction.refundedAmount)}</p> : null}
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
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
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
        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
        {savedId ? (
          <Button type="button" onClick={() => onSaved(savedId)}>
            Done
          </Button>
        ) : (
          <Button type="submit" disabled={saveDisabled}>
            {saving ? "Saving" : "Save"}
          </Button>
        )}
      </DialogFooter>
    </DialogForm>
  );
}
