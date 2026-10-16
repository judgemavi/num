import { useDraftReview, useDraftSuggestion } from "@/transactions/use-draft-suggestion";
import { DecisionNotes } from "@/review/decision-notes";
import { amountText, moneyDirection, type MoneyDirection, type Transaction } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { useEffect } from "react";
import { errorCode } from "@/api/client";
import { localAsOf } from "@/as-of";
import { useDeleteTransaction, useSaveTransaction } from "@/api/transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody } from "@/editors/form-chrome";
import { useAccountLabels, useAccounts, useBookCurrency, useCategories } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { searchDelayMs } from "@/lists/list-search";
import { formatMoney } from "@/money";
import { formatDate } from "@/date-format";
import { levelLabel, refundedText, transactionError } from "@/transactions/format";
import { DeleteMenu, MoneySection, TagsField } from "@/transactions/transaction-parts";
import { PaymentForField } from "@/transactions/payment-for-field";
import { alreadyChosen, answerFilled, interestLine, quietChange, signedTotal, transactionValues } from "@/transactions/transaction-draft";
import { buildTransactionSave, reviewAnswer } from "@/transactions/transaction-submit";
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

export function TransactionForm({
  transaction,
  amountLocked,
  rawLine,
  initialAccountId,
  unreadableItemKey,
  deleteKind = "plain",
}: TransactionFormProps) {
  const { close } = useEditorFrame();
  const review = useDraftReview(transaction?.id ?? null);
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const accountLabels = useAccountLabels();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const imported = transaction?.source === "import";
  // An imported transaction keeps its amount. An amount that the person did not change keeps its stored value.
  const startAmount = transaction ? amountText(Math.abs(transaction.amount)) : null;
  const storedTotal = (value: { amount: string; direction: MoneyDirection }) =>
    transaction && (imported || (value.amount === startAmount && value.direction === moneyDirection(transaction.amount))) ? transaction.amount : null;

  const answerOf = (paymentFor: string | null) => reviewAnswer(review, paymentFor, localAsOf());

  const form = useAppForm({
    defaultValues: transactionValues(categories, transaction, initialAccountId ?? accounts.find((item) => !item.archivedAt)?.id ?? "", review),
    validators: {
      onSubmit: ({ value }) => {
        const total = signedTotal(currency, storedTotal(value), value.amount, value.direction);
        if (value.payee.trim().length === 0) {
          return "Enter a description.";
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
        const built = buildTransactionSave({ ...value, currency, transaction, totalMilli: total, unreadableItemKey, answer: answerOf(value.paymentFor) });
        return built.ok ? undefined : built.error;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const total = signedTotal(currency, storedTotal(value), value.amount, value.direction);
      const built =
        total === null
          ? null
          : buildTransactionSave({ ...value, currency, transaction, totalMilli: total, unreadableItemKey, answer: answerOf(value.paymentFor) });
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
  const touched = useStore(
    form.store,
    (state) => alreadyChosen(transaction) || answerFilled(review) || choiceFields.some((name) => state.fieldMeta[name]?.isTouched),
  );
  const totalMilli = signedTotal(currency, storedTotal(values), values.amount, values.direction);
  const suggested = useDraftSuggestion(values, storedTotal({ ...values, amount: values.suggestionAmount }));

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

  const saveDisabled =
    values.accountId.length === 0 ||
    totalMilli === null ||
    ((values.choice === "transfer" || values.choice === "loan_payment") && !values.transferAccountId) ||
    (values.choice === "loan_payment" && (values.interest.trim().length === 0 || !values.interestCategoryId));
  const summary = `${formatDate(values.date)} · ${accountLabels.get(values.accountId) ?? "Account"} · ${values.direction === "out" ? "Money out" : "Money in"} ${formatMoney(currency, Math.abs(totalMilli ?? 0))}`;

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
          {amountLocked ? <DialogDescription>This side follows the other account. Change the amount there.</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          {transaction ? <DecisionNotes transactionId={transaction.id} /> : null}
          {rawLine ? (
            <p className="rounded-xl bg-sunken px-3 py-2 text-sm break-all">
              <span className="font-semibold">Statement line. </span>
              {rawLine}
            </p>
          ) : null}
          {transaction?.autoReason ? (
            <div>
              <Badge variant="neutral">{levelLabel("sure")}</Badge>
            </div>
          ) : null}
          {imported ? (
            <p className="text-sm">{summary}</p>
          ) : (
            <MoneySection form={form} moneyLocked={amountLocked || imported} />
          )}
          <form.AppField name="payee" listeners={{
            onChangeDebounceMs: searchDelayMs,
            onChange: ({ value, fieldApi }) => fieldApi.form.setFieldValue("suggestionPayee", value, quietChange),
          }}>
            {(field) => (
              <field.TextField
                id="txn-payee"
                label="Description"
                disabled={imported}
                description={imported ? "From the bank import. It does not change." : undefined}
              />
            )}
          </form.AppField>
          <WhatIsThis
            form={form}
            locked={amountLocked}
            transactionId={transaction?.id ?? null}
            loanFill={interestLine(transaction) === null}
            storedAmount={storedTotal(values)}
          />
          {review?.question === "recurring_ambiguous" && review.recurring ? <PaymentForField form={form} occurrence={review.recurring} /> : null}
          {transaction?.refundedAmount ? <p className="text-sm text-muted-foreground">{refundedText(currency, transaction.refundedAmount)}</p> : null}
          <form.Field name="tagIds">{(field) => <TagsField tagIds={field.state.value} onTags={field.handleChange} />}</form.Field>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          {transaction ? (
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
