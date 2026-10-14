import {
  categoryKindForChoice,
  choicesForDirection,
  defaultChoice,
  fromMinorUnits,
  merchantForChoice,
  moneyDirection,
  type Transaction,
  type WhatChoice,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { errorCode } from "@/api/client";
import { localAsOf } from "@/as-of";
import { useDeleteTransaction, useSaveTransaction } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { FieldError } from "@/components/ui/field";
import { useAccountLabels, useAccounts, useBookCurrency, useCategories } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { formatDate, refundedText, transactionError } from "@/transactions/format";
import { mortgageSplitFill, useMortgageSplit } from "@/transactions/mortgage-split";
import { AutomaticReason, DecisionNotes, DeleteMenu, MoneySection, MoreDetails } from "@/transactions/transaction-parts";
import { alreadyChosen, choiceOf, linesOf, signedTotal, useApplySuggestion } from "@/transactions/transaction-draft";
import { buildTransactionSave } from "@/transactions/transaction-submit";
import { splitBlank, splitRemainder } from "@/transactions/what-choice";
import { WhatIsThis } from "@/transactions/what-is-this";

type TransactionFormProps = {
  transaction: Transaction | null;
  /** True when this side of a transfer follows the other account. */
  amountLocked: boolean;
  rawLine?: string;
  initialAccountId?: string;
  unreadableItemKey?: string;
  deleteKind?: "plain" | "mirror" | "linked";
};

export function TransactionForm({ transaction, amountLocked, rawLine, initialAccountId, unreadableItemKey, deleteKind = "plain" }: TransactionFormProps) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const accountLabels = useAccountLabels();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const reconciled = transaction?.reconciled === true;
  const imported = transaction?.source === "import";
  const moneyLocked = reconciled || amountLocked || imported;
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? initialAccountId ?? accounts.find((item) => !item.archivedAt)?.id ?? "",
  );
  const [date, setDate] = useState(transaction?.date ?? localAsOf());
  const [direction, setDirection] = useState(transaction ? moneyDirection(transaction.amount) : "out");
  const [amount, setAmount] = useState(transaction ? fromMinorUnits(currency, Math.abs(transaction.amount)) : "");
  const [payee, setPayee] = useState(transaction?.payeeRaw ?? "");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [cleared, setCleared] = useState(transaction?.status === "cleared");
  const [merchantId, setMerchantId] = useState(transaction?.merchantId ?? null);
  const [refundOfId, setRefundOfId] = useState(transaction?.refundOfId ?? null);
  const [choice, setChoice] = useState(choiceOf(transaction, categories));
  const [categoryId, setCategoryId] = useState(transaction?.lines[0]?.categoryId ?? null);
  const [transferAccountId, setTransferAccountId] = useState(transaction?.lines[0]?.transferAccountId ?? null);
  const [linesEdited, setLinesEdited] = useState(
    () => transaction !== null && (transaction.lines.length > 1 || transaction.lines.some((line) => line.categoryId !== null || line.transferAccountId !== null)),
  );
  const [lines, setLines] = useState(() =>
    transaction && transaction.lines.length > 1
      ? linesOf(currency, transaction, fromMinorUnits(currency, Math.abs(transaction.amount)), moneyDirection(transaction.amount))
      : [],
  );
  const [tagIds, setTagIds] = useState(() => [...new Set(transaction?.lines.flatMap((line) => line.tagIds) ?? [])]);
  const [splitFilled, setSplitFilled] = useState(false);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(alreadyChosen(transaction));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saving = save.isPending;
  const failure = save.error ?? remove.error;
  const error = invalid ?? (failure ? transactionError(errorCode(failure)) : null);

  const hintAmount = signedTotal(currency, imported, transaction, amount, direction);
  const suggestion = useApplySuggestion({
    accountId,
    payee,
    date,
    direction,
    amount: hintAmount,
    touched,
    setChoice,
    setCategoryId,
    setTransferAccountId,
    setMerchantId,
  });

  // A mortgage payment from the payment account gets its two lines from the schedule, one time. The form fills them
  // when the read of the schedule completes. This is a change of state during render, not an effect: the form shows
  // the lines in the same render as the answer. After that, the person owns the lines.
  const mortgageSplit = useMortgageSplit({
    open: !reconciled && !linesEdited && !splitFilled,
    choice,
    direction,
    fromAccountId: accountId,
    toAccountId: transferAccountId,
    date,
  });
  if (mortgageSplit && !splitFilled) {
    const fill = mortgageSplitFill(currency, mortgageSplit, amount);
    setSplitFilled(true);
    setChoice("split");
    setLines(fill.lines);
    if (!transaction && fill.total !== null) {
      setAmount(fill.total);
    }
    setNotice("Num put the principal and interest from the schedule in the lines. You can change the amounts.");
  }

  const accountName = accountLabels.get(accountId) ?? "Account";
  const totalMinor = hintAmount;
  const left = choice === "split" && totalMinor !== null ? splitRemainder(currency, totalMinor, direction, lines) : null;
  const saveDisabled =
    saving ||
    accountId.length === 0 ||
    totalMinor === null ||
    (choice === "transfer" && !transferAccountId) ||
    (choice === "split" && (left !== 0 || splitBlank(lines)));

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
              { key: crypto.randomUUID(), amount, opposite: false, edited: false, categoryId, transferAccountId: null },
              { key: crypto.randomUUID(), amount: "", opposite: false, edited: false, categoryId: null, transferAccountId: null },
            ],
      );
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvalid(null);
    if (payee.trim().length === 0) {
      setInvalid("Enter the bank text.");
      setMore(true);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setInvalid("Choose a date.");
      return;
    }
    if (totalMinor === null) {
      setInvalid("Enter a positive amount.");
      return;
    }
    if (choice === "transfer" && !transferAccountId) {
      setInvalid("Choose the other account.");
      return;
    }
    if (choice === "split" && (left !== 0 || splitBlank(lines))) {
      setInvalid("Assign the whole amount.");
      return;
    }
    const built = buildTransactionSave({
      currency,
      transaction,
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
    if (!built.ok) {
      setInvalid(built.error);
      return;
    }
    remove.reset();
    save.mutate(built.save, {
      onSuccess: (result) => {
        if (result.skipped > 0) {
          setNotice(`Applied to ${result.applied} · skipped ${result.skipped}`);
          setSavedId(result.id);
          return;
        }
        close(result.id);
      },
    });
  }
  const summary = `${formatDate(date)} · ${accountName} · ${direction === "out" ? "Money out" : "Money in"} ${formatMoney(currency, Math.abs(imported && transaction ? transaction.amount : (totalMinor ?? 0)))} · ${payee}`;

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        <DialogDescription>
          {amountLocked ? "This side follows the other account. Change the amount there." : "Say where the money went."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
      {transaction ? <DecisionNotes transactionId={transaction.id} /> : null}
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
        <AutomaticReason transaction={{ ...transaction, autoReason: transaction.autoReason }} />
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
        onLines={(next) => {
          setLinesEdited(true);
          setLines(next);
        }}
        amountsLocked={reconciled || amountLocked}
        totalMinor={totalMinor}
        accountId={accountId}
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
        date={date}
      />
      {transaction?.refundedAmount ? <p className="text-sm text-muted-foreground">{refundedText(currency, transaction.refundedAmount)}</p> : null}
      <MoreDetails
        open={more}
        onOpenChange={setMore}
        notes={notes}
        onNotes={setNotes}
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
            onDelete={() => {
              setInvalid(null);
              save.reset();
              remove.mutate(transaction, { onSuccess: () => close() });
            }}
          />
        ) : null}
        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
        {savedId ? (
          <Button type="button" onClick={() => close(savedId)}>
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
