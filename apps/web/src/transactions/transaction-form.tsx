import {
  categoryKindForChoice,
  choicesForDirection,
  defaultChoice,
  fromMinorUnits,
  merchantForChoice,
  moneyDirection,
  normalizePayee,
  transactionSaveResultSchema,
  transactionWriteSchema,
  signedAmount,
  Temporal,
  type Account,
  type Category,
  type Merchant,
  type MoneyDirection,
  type RuleMatch,
  type Tag,
  type Transaction,
  type WhatChoice,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { formatMoney } from "@/money";
import { formatDate, transactionError } from "@/transactions/format";
import { DeleteMenu, MoneySection, MoreDetails } from "@/transactions/transaction-parts";
import { alreadyChosen, choiceOf, linesOf, readPositive, signedTotal, useApplySuggestion } from "@/transactions/transaction-draft";
import { PayeeRuleField } from "@/transactions/payee-rule-field";
import { splitRemainder, type SplitLine } from "@/transactions/what-choice";
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
  const [choice, setChoice] = useState<WhatChoice>(choiceOf(transaction, categories));
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.lines[0]?.categoryId ?? null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(transaction?.lines[0]?.transferAccountId ?? null);
  const [lines, setLines] = useState<SplitLine[]>(() =>
    transaction && transaction.lines.length > 1
      ? linesOf(currency, transaction, fromMinorUnits(currency, Math.abs(transaction.amount)), moneyDirection(transaction.amount))
      : [],
  );
  const [tagIds, setTagIds] = useState<string[]>(() => [...new Set(transaction?.lines.flatMap((line) => line.tagIds) ?? [])]);
  const [more, setMore] = useState(false);
  const [always, setAlways] = useState(false);
  const [ruleMatch, setRuleMatch] = useState<RuleMatch>("exact");
  const [rulePattern, setRulePattern] = useState(transaction ? normalizePayee(transaction.payeeRaw) : "");
  const [patternTouched, setPatternTouched] = useState(false);
  const [touched, setTouched] = useState(alreadyChosen(transaction));
  const [error, setError] = useState<string | null>(null);
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
  if (!patternTouched && rulePattern !== normalizePayee(payee)) {
    setRulePattern(normalizePayee(payee));
  }

  const accountName = accounts.find((item) => item.id === accountId)?.name ?? "Account";
  const accountOptions = accounts
    .filter((account) => account.archivedAt === null || account.id === accountId)
    .map((account) => ({ id: account.id, label: account.archivedAt ? `${account.name} (archived)` : account.name }));
  const transferOptions = accounts
    .filter((account) => account.id !== accountId && (account.archivedAt === null || account.id === transferAccountId || lines.some((line) => line.transferAccountId === account.id)))
    .map((account) => ({ id: account.id, label: account.archivedAt ? `${account.name} (archived)` : account.name }));
  const merchantOptions = merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }));
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
                categoryId: choice === "transfer" ? null : categoryId,
                transferAccountId: choice === "transfer" ? transferAccountId : null,
                tagIds,
              },
            ];
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the transaction fields.");
      return;
    }
    if (always && choice !== "split") {
      if ((choice === "transfer" && !transferAccountId) || (choice !== "transfer" && !categoryId) || rulePattern.trim().length === 0) {
        setError("Choose a category or account for the rule.");
        return;
      }
    }
    const body = {
      accountId,
      date,
      amount: totalMinor,
      merchantId: merchantForChoice(choice, merchantId),
      notes: notes.trim().length === 0 ? null : notes.trim(),
      payeeRaw: payee.trim(),
      status: reconciled ? "open" : cleared ? "cleared" : "open",
      lines: built,
      ...(always && choice !== "split"
        ? { rule: { payee: normalizePayee(payee), match: ruleMatch, pattern: rulePattern.trim() } }
        : {}),
    };
    const parsed = transactionWriteSchema.safeParse(body);
    if (!parsed.success) {
      setError("Check the transaction fields.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(transaction ? `/api/transactions/${transaction.id}` : "/api/transactions", transactionSaveResultSchema, {
      method: transaction ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setSaving(false);
    if (!result.ok) {
      setError(transactionError(result.code));
      return;
    }
    const skipped = result.data.skipped?.length ?? 0;
    if (skipped > 0) {
      setNotice(`Applied to ${result.data.applied ?? 0} · skipped ${skipped}`);
      setSavedId(result.data.id);
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
        payee={payee}
        suggestion={suggestion}
      />
      {choice === "split" ? null : (
      <PayeeRuleField
        payee={payee}
        accountId={accountId}
        exceptIds={transaction?.id ?? ""}
        enabled={always}
        onEnabled={setAlways}
        match={ruleMatch}
        onMatch={setRuleMatch}
        pattern={rulePattern}
        onPattern={(value) => {
          setPatternTouched(true);
          setRulePattern(value);
        }}
      />
      )}
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
    </form>
  );
}
