import {
  fromMinorUnits,
  Temporal,
  toMinorUnits,
  transactionCreateSchema,
  transactionSchema,
  transactionUpdateSchema,
  type Account,
  type Category,
  type Merchant,
  type Tag,
  type Transaction,
  type TransactionInputStatus,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transactionError } from "@/transactions/format";
import { emptyLine, lineAmountError, lineAmounts, type LineDraft } from "@/transactions/line-draft";
import { LineEditor } from "@/transactions/line-editor";
import { OptionCombobox } from "@/transactions/option-combobox";

type TransactionFormProps = {
  currency: string;
  transaction: Transaction | null;
  amountLocked: boolean;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  merchants: Merchant[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
};

function readAmount(currency: string, text: string): number {
  try {
    return toMinorUnits(currency, text.trim());
  } catch (error) {
    if (error instanceof Error && error.message === "Amount has too many decimal places") {
      throw new Error("The amount has too many decimal places.");
    }
    throw new Error("Enter the amount as a number.");
  }
}

function linesFrom(currency: string, transaction: Transaction | null): LineDraft[] {
  if (!transaction) {
    const line = emptyLine(currency);
    line.amount = "";
    return [line];
  }
  return transaction.lines.map((line) => ({
    key: line.id,
    amount: fromMinorUnits(currency, line.amount),
    memo: line.memo ?? "",
    categoryId: line.categoryId,
    transferAccountId: line.transferAccountId,
    tagIds: [...line.tagIds],
  }));
}

function isStatus(value: string): value is TransactionInputStatus {
  return value === "open" || value === "cleared";
}

export function TransactionForm({
  currency,
  transaction,
  amountLocked,
  accounts,
  categories,
  tags,
  merchants,
  onClose,
  onSaved,
  onDelete,
}: TransactionFormProps) {
  const locked = transaction?.status === "reconciled";
  const payeeLocked = transaction?.source === "import";
  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts.find((item) => !item.archivedAt)?.id ?? "");
  const [date, setDate] = useState(transaction?.date ?? Temporal.Now.plainDateISO().toString());
  const [payee, setPayee] = useState(transaction?.payeeRaw ?? "");
  const [amount, setAmount] = useState(transaction ? fromMinorUnits(currency, transaction.amount) : "");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [status, setStatus] = useState<TransactionInputStatus>(
    transaction?.status === "cleared" || transaction?.status === "reconciled" ? "cleared" : "open",
  );
  const [merchantId, setMerchantId] = useState<string | null>(transaction?.merchantId ?? null);
  const [lines, setLines] = useState<LineDraft[]>(() => linesFrom(currency, transaction));
  const [linkAmount, setLinkAmount] = useState(transaction === null || transaction.lines.length === 1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const accountOptions = accounts
    .filter((account) => account.archivedAt === null || account.id === accountId)
    .map((account) => ({
      id: account.id,
      label: account.archivedAt ? `${account.name} (archived)` : account.name,
    }));
  const transferOptions = accounts
    .filter((account) => account.id !== accountId && (account.archivedAt === null || lines.some((line) => line.transferAccountId === account.id)))
    .map((account) => ({
      id: account.id,
      label: account.archivedAt ? `${account.name} (archived)` : account.name,
    }));

  function changeAmount(text: string) {
    setAmount(text);
    if (linkAmount && lines.length === 1 && lines[0]) {
      setLines([{ ...lines[0], amount: text }]);
    }
  }

  function changeLines(next: LineDraft[]) {
    setLinkAmount(false);
    setLines(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) {
      return;
    }
    setError(null);
    const amountProblem = lineAmountError(currency, lines);
    if (amountProblem) {
      setError(amountProblem);
      return;
    }
    let body: unknown;
    try {
      if (payee.trim().length === 0) {
        setError("Enter a payee.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setError("Choose a date.");
        return;
      }
      body = {
        accountId,
        date,
        amount: readAmount(currency, amount),
        merchantId,
        notes: notes.trim().length === 0 ? null : notes.trim(),
        payeeRaw: payee,
        status: transaction?.status === "reconciled" ? "open" : status,
        lines: lines.map((line, index) => ({
          amount: lineAmounts(currency, lines)[index],
          memo: line.memo.trim().length === 0 ? null : line.memo.trim(),
          categoryId: line.categoryId,
          transferAccountId: line.transferAccountId,
          tagIds: line.tagIds,
        })),
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the transaction fields.");
      return;
    }

    const parsed = (transaction ? transactionUpdateSchema : transactionCreateSchema).safeParse(body);
    if (!parsed.success) {
      setError("Check the transaction fields.");
      return;
    }
    const lineTotal = parsed.data.lines.reduce((sum, line) => sum + line.amount, 0);
    if (lineTotal !== parsed.data.amount) {
      setError("The lines must add up to the amount.");
      return;
    }

    setSaving(true);
    const result = await apiRequest(
      transaction ? `/api/transactions/${transaction.id}` : "/api/transactions",
      transactionSchema,
      {
        method: transaction ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(transactionError(result.code));
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        <DialogDescription>
          {amountLocked
            ? "This side follows the other account. Change the amount there."
            : "Enter the payee, the amount and the lines."}
        </DialogDescription>
      </DialogHeader>
      {locked ? (
        <p role="status">This transaction is reconciled. Unlock its checkpoint before you change it.</p>
      ) : null}
      <Field data-invalid={error !== null || undefined}>
        <FieldLabel htmlFor="txn-account">Account</FieldLabel>
        <OptionCombobox
          id="txn-account"
          value={accountId || null}
          options={accountOptions}
          placeholder="Choose an account"
          disabled={locked || accounts.length === 0}
          onChange={(id) => {
            if (id) {
              setAccountId(id);
            }
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-date">Date</FieldLabel>
        <Input id="txn-date" type="date" value={date} disabled={locked} onChange={(event) => setDate(event.target.value)} required />
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-payee">Payee</FieldLabel>
        <Input id="txn-payee" value={payee} disabled={locked || payeeLocked} onChange={(event) => setPayee(event.target.value)} />
        {payeeLocked ? <FieldDescription>The bank text stays as it was imported.</FieldDescription> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-amount">Amount</FieldLabel>
        <Input
          id="txn-amount"
          inputMode="decimal"
          value={amount}
          disabled={locked || amountLocked}
          onChange={(event) => changeAmount(event.target.value)}
        />
        <FieldDescription>Use a minus sign for money out. Example: -12.50</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-merchant">Merchant</FieldLabel>
        <OptionCombobox
          id="txn-merchant"
          value={merchantId}
          options={merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }))}
          placeholder="No merchant"
          emptyLabel="No merchant"
          disabled={locked}
          onChange={setMerchantId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-notes">Notes</FieldLabel>
        <Textarea id="txn-notes" value={notes} disabled={locked} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="txn-status">Status</FieldLabel>
        {transaction?.status === "reconciled" ? (
          <Input id="txn-status" value="Reconciled" disabled />
        ) : (
          <Select
            value={status}
            onValueChange={(value) => {
              if (isStatus(value)) {
                setStatus(value);
              }
            }}
          >
            <SelectTrigger id="txn-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <LineEditor
        currency={currency}
        lines={lines}
        categories={categories}
        tags={tags}
        transferOptions={transferOptions}
        disabled={locked}
        amountLocked={amountLocked}
        onChange={changeLines}
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        {transaction && !locked ? (
          <Button type="button" variant="destructive" className="sm:mr-auto" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {locked ? null : (
          <Button type="submit" disabled={saving || accountId.length === 0}>
            {saving ? "Saving" : "Save"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
