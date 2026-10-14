import { amountText, moneyDirection, type MoneyDirection, type Transaction } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { useEffect } from "react";
import { errorCode } from "@/api/client";
import { useDeleteTransaction, useSaveTransaction } from "@/api/transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody } from "@/editors/form-chrome";
import { useAccountLabels, useAccounts, useBookCurrency, useCategories } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { formatMoney } from "@/money";
import { formatDate, levelLabel, refundedText, transactionError } from "@/transactions/format";
import { mortgageSplitFill, useMortgageSplit } from "@/transactions/mortgage-split";
import { DecisionNotes, DeleteMenu, MoneySection, MoreDetails } from "@/transactions/transaction-parts";
import { alreadyChosen, quietChange, signedTotal, transactionValues, useSuggestion } from "@/transactions/transaction-draft";
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

/** The fields that the person sets to answer "What is this?". A change to one of them stops the suggestion. */
const choiceFields = ["choice", "categoryId", "transferAccountId", "merchantId", "refundOfId"] as const;

const mortgageNotice = "Num put the principal and interest from the schedule in the lines. You can change the amounts.";

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
  // An imported transaction keeps its amount. An amount that the person did not change keeps its stored value (decision 0040).
  const startAmount = transaction ? amountText(Math.abs(transaction.amount)) : null;
  const storedTotal = (value: { amount: string; direction: MoneyDirection }) =>
    transaction && (imported || (value.amount === startAmount && value.direction === moneyDirection(transaction.amount))) ? transaction.amount : null;

  const form = useAppForm({
    defaultValues: transactionValues(categories, transaction, initialAccountId ?? accounts.find((item) => !item.archivedAt)?.id ?? ""),
    validators: {
      onSubmit: ({ value }) => {
        const total = signedTotal(currency, storedTotal(value), value.amount, value.direction);
        if (value.payee.trim().length === 0) {
          return "Enter the bank text.";
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
          return "Choose a date.";
        }
        if (total === null) {
          return "Enter a positive amount.";
        }
        if (value.choice === "transfer" && !value.transferAccountId) {
          return "Choose the other account.";
        }
        if (value.choice === "split" && (splitRemainder(currency, total, value.direction, value.lines) !== 0 || splitBlank(value.lines))) {
          return "Assign the whole amount.";
        }
        const built = buildTransactionSave({ ...value, currency, transaction, totalMilli: total, unreadableItemKey });
        return built.ok ? undefined : built.error;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const total = signedTotal(currency, storedTotal(value), value.amount, value.direction);
      const built = total === null ? null : buildTransactionSave({ ...value, currency, transaction, totalMilli: total, unreadableItemKey });
      if (!built?.ok) {
        return;
      }
      // An edit with no change closes without a write.
      if (!built.save) {
        close();
        return;
      }
      try {
        close((await save.mutateAsync(built.save)).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: transactionError(errorCode(error)), fields: {} } });
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const touched = useStore(form.store, (state) => alreadyChosen(transaction) || choiceFields.some((name) => state.fieldMeta[name]?.isTouched));
  const linesEdited = useStore(form.store, (state) => alreadyChosen(transaction) || state.fieldMeta.lines?.isTouched === true);
  const totalMilli = signedTotal(currency, storedTotal(values), values.amount, values.direction);
  const suggested = useSuggestion({ accountId: values.accountId, payee: values.payee, date: values.date, direction: values.direction, amount: totalMilli });

  // The suggestion arrives from the API, outside the form. The form takes its choice until the person makes a choice.
  const suggestedChoice = touched ? null : suggested.choice;
  useEffect(() => {
    if (!suggestedChoice) {
      return;
    }
    form.setFieldValue("choice", suggestedChoice.choice, quietChange);
    form.setFieldValue("categoryId", suggestedChoice.categoryId, quietChange);
    form.setFieldValue("transferAccountId", suggestedChoice.transferAccountId, quietChange);
    form.setFieldValue("merchantId", suggestedChoice.merchantId, quietChange);
  }, [suggestedChoice, form]);

  // A mortgage payment from the payment account gets its two lines from the schedule, one time, when the read of the
  // schedule completes. After that, the person owns the lines.
  const mortgageSplit = useMortgageSplit({
    open: !reconciled && !linesEdited && !values.mortgageFilled,
    choice: values.choice,
    direction: values.direction,
    fromAccountId: values.accountId,
    toAccountId: values.transferAccountId,
    date: values.date,
  });
  useEffect(() => {
    if (!mortgageSplit || form.getFieldValue("mortgageFilled")) {
      return;
    }
    const fill = mortgageSplitFill(currency, mortgageSplit, form.getFieldValue("amount"));
    form.setFieldValue("mortgageFilled", true, quietChange);
    form.setFieldValue("choice", "split", quietChange);
    form.setFieldValue("lines", fill.lines, quietChange);
    if (!transaction && fill.total !== null) {
      form.setFieldValue("amount", fill.total, quietChange);
    }
  }, [mortgageSplit, currency, form, transaction]);

  const left = values.choice === "split" && totalMilli !== null ? splitRemainder(currency, totalMilli, values.direction, values.lines) : null;
  const saveDisabled =
    values.accountId.length === 0 ||
    totalMilli === null ||
    (values.choice === "transfer" && !values.transferAccountId) ||
    (values.choice === "split" && (left !== 0 || splitBlank(values.lines)));
  const summary = `${formatDate(values.date)} · ${accountLabels.get(values.accountId) ?? "Account"} · ${values.direction === "out" ? "Money out" : "Money in"} ${formatMoney(currency, Math.abs(totalMilli ?? 0))} · ${values.payee}`;

  return (
    <form.AppForm>
      <form.FormShell>
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
            <div>
              <Badge variant="neutral">{levelLabel("sure")}</Badge>
            </div>
          ) : null}
          {imported ? (
            <p className="text-sm">{summary}</p>
          ) : (
            <MoneySection form={form} moneyLocked={reconciled || amountLocked || imported} accountLocked={reconciled} />
          )}
          <WhatIsThis
            form={form}
            choiceLocked={reconciled || amountLocked}
            categoryLocked={amountLocked}
            transferLocked={reconciled || amountLocked}
            amountsLocked={reconciled || amountLocked}
            storedAmount={storedTotal(values)}
            linkedRefund={values.refundOfId !== null && transaction?.refundOf?.id === values.refundOfId ? transaction.refundOf : null}
          />
          {transaction?.refundedAmount ? <p className="text-sm text-muted-foreground">{refundedText(currency, transaction.refundedAmount)}</p> : null}
          <MoreDetails form={form} payeeLocked={imported} clearedLocked={reconciled} />
          {values.mortgageFilled ? <p role="status">{mortgageNotice}</p> : null}
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          {transaction && !reconciled ? (
            <DeleteMenu
              kind={deleteKind}
              onDelete={() => {
                form.setErrorMap({ onSubmit: undefined });
                remove.mutate(transaction, { onSuccess: () => close() });
              }}
            />
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton disabled={saveDisabled} saving="Saving">
            Save
          </form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
