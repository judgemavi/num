import { editPatch, keptAmount } from "@/forms/form-values";
import { accountClass, amountText, valuationInputSchema, parseAmount, entryFromBalance } from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { valuationListQuery, useSaveValuation } from "@/api/valuations";
import { errorCode } from "@/api/client";
import { valuationError } from "@/accounts/format";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useBookCurrency } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { decimalsError } from "@/money";

/** The values of the form as a valuation. Null when the date or the balance is not valid. */
function valuationOf(currency: string, value: { date: string; amount: string; note: string }, start: { text: string; amount: number } | null) {
  let balance;
  try {
    balance = keptAmount(value.amount, start, (text) => parseAmount(currency, text.trim()));
  } catch {
    return null;
  }
  const parsed = valuationInputSchema.safeParse({ date: value.date, balance, note: value.note.trim() || null });
  return parsed.success ? parsed.data : null;
}

export function ValuationEditor({ accountId, id }: EditorInput["valuation"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const [{ data: account }, { data: list }] = useSuspenseQueries({
    queries: [accountQuery(accountId), valuationListQuery(accountId)],
  });
  const save = useSaveValuation();
  const kind = account.kind;
  const owed = accountClass(kind) === "liability";
  const saved = list.items.find((item) => item.id === id);
  if (id !== null && !saved) throw new Error("That valuation is not in the book.");
  const start = saved ? { text: amountText(entryFromBalance(kind, saved.balance)), amount: entryFromBalance(kind, saved.balance) } : null;
  const form = useAppForm({
    defaultValues: {
      date: saved?.date ?? "",
      amount: saved ? amountText(entryFromBalance(kind, saved.balance)) : "",
      note: saved?.note ?? "",
    },
    validators: {
      onSubmit: ({ value }) =>
        valuationOf(currency, value, start) ? undefined : (decimalsError(currency, value.amount) ?? "Enter a date and a balance."),
    },
    onSubmit: async ({ value, formApi }) => {
      const body = valuationOf(currency, value, start);
      if (!body) {
        return;
      }
      try {
        if (saved) {
          const patch = editPatch(body, { date: saved.date, balance: entryFromBalance(kind, saved.balance), note: saved.note });
          if (!patch) {
            close();
            return;
          }
          close((await save.mutateAsync({ accountId, id: saved.id, body: patch })).id);
        } else {
          close((await save.mutateAsync({ accountId, id: null, body })).id);
        }
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: valuationError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <DialogHeader>
        <DialogTitle>{id ? "Change valuation" : "Add valuation"}</DialogTitle>
      </DialogHeader>
      <form.FormShell>
        <DialogBody>
          <form.AppField name="date">
            {(field) => <field.DateInputField id="valuation-date" label="Date" required />}
          </form.AppField>
          <form.AppField name="amount">
            {(field) => (
              <field.MoneyField
                id="valuation-amount"
                label={owed ? "Amount you owed" : "Balance"}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="note">
            {(field) => <field.TextField id="valuation-note" label="Note" />}
          </form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close()}>
            Cancel
          </Button>
          <form.SubmitButton>Save</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
