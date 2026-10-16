import { keptAmount } from "@/forms/form-values";
import { accountClass, amountText, bankBalanceInputSchema, parseAmount, printedBankBalance, storedBankBalance, type AccountKind } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { bankBalanceListQuery, useSaveBankBalance } from "@/api/bank-balances";
import { errorCode } from "@/api/client";
import { bankBalanceError } from "@/accounts/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useBookCurrency } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { decimalsError } from "@/money";

/** The values of the form as a bank balance. Null when the date or the balance is not valid. */
function bankBalanceOf(currency: string, kind: AccountKind, value: { date: string; amount: string }, start: { text: string; amount: number } | null) {
  let balance;
  try {
    balance = keptAmount(value.amount, start, (text) => storedBankBalance(kind, parseAmount(currency, text.trim())));
  } catch {
    return null;
  }
  const parsed = bankBalanceInputSchema.safeParse({ date: value.date, balance });
  return parsed.success ? parsed.data : null;
}

export function BankBalanceEditor({ accountId, id }: EditorInput["bankBalance"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const { data: list } = useSuspenseQuery(bankBalanceListQuery(accountId));
  const save = useSaveBankBalance();
  const kind = account.kind;
  const owed = accountClass(kind) === "liability";
  const saved = list.items.find((item) => item.id === id);
  const start = saved ? { text: amountText(printedBankBalance(kind, saved.balance)), amount: saved.balance } : null;
  const form = useAppForm({
    defaultValues: {
      date: saved?.date ?? "",
      amount: saved ? amountText(printedBankBalance(kind, saved.balance)) : "",
    },
    validators: {
      onSubmit: ({ value }) =>
        bankBalanceOf(currency, kind, value, start) ? undefined : (decimalsError(currency, value.amount) ?? "Enter a date and a balance."),
    },
    onSubmit: async ({ value, formApi }) => {
      const body = bankBalanceOf(currency, kind, value, start);
      if (!body) {
        return;
      }
      try {
        if (saved && saved.date === body.date && saved.balance === body.balance) {
          close();
          return;
        }
        close((await save.mutateAsync({ accountId, id, body })).id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: bankBalanceError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <DialogHeader>
        <DialogTitle>{id ? "Change bank balance" : "Add bank balance"}</DialogTitle>
      </DialogHeader>
      <form.FormShell>
        <DialogBody>
          <form.AppField name="date">
            {(field) => <field.DateInputField id="bank-balance-date" label="Date" required />}
          </form.AppField>
          <form.AppField name="amount">
            {(field) => (
              <field.MoneyField
                id="bank-balance-amount"
                label={owed ? "Amount you owed" : "Bank balance"}
                required
                description={owed ? "Enter the amount that your bank shows. Example: 12.50" : "Example: 12.50"}
              />
            )}
          </form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton>Save</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
