import {
  accountClass,
  checkpointCreateSchema,
  fromMinorUnits,
  printedStatementBalance,
  storedStatementBalance,
  toMinorUnits,
  type Account,
  type CheckpointCreate,
} from "@num/shared";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { useState } from "react";
import { accountQuery, useSetOpeningBalance } from "@/api/accounts";
import { checkpointCompareQuery, closingHintQuery, useCreateCheckpoint } from "@/api/checkpoints";
import { errorCode } from "@/api/client";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { useBookCurrency } from "@/editors/lookups";
import { DialogBody } from "@/editors/form-chrome";
import { FieldError } from "@/components/ui/field";
import { useAppForm } from "@/forms/form-hook";
import { formatDate } from "@/transactions/format";

/** The checkpoint of the form values. Null when the date or the balance is not valid. */
function checkpointOf(currency: string, kind: Account["kind"], value: { date: string; amount: string }) {
  let statementBalance;
  try {
    statementBalance = storedStatementBalance(kind, toMinorUnits(currency, value.amount.trim()));
  } catch {
    return null;
  }
  const parsed = checkpointCreateSchema.safeParse({ date: value.date, statementBalance });
  return parsed.success ? parsed.data : null;
}

export function ReconcileDialog({ accountId }: EditorInput["reconcile"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const [{ data: account }, { data: hint }] = useSuspenseQueries({ queries: [accountQuery(accountId), closingHintQuery(accountId)] });
  const kind = account.kind;
  // The values that the person sent with "Check". The compare read runs for them. An edit of a value clears them.
  const [checked, setChecked] = useState<CheckpointCreate | null>(null);
  const check = useQuery({ ...checkpointCompareQuery(accountId, checked ?? { date: "", statementBalance: 0 }), enabled: checked !== null });
  const create = useCreateCheckpoint();
  const opening = useSetOpeningBalance();
  const compare = checked ? (check.data ?? null) : null;
  const form = useAppForm({
    // The form starts with the closing date and the closing balance of the last imported statement.
    defaultValues: {
      date: hint.closingDate ?? "",
      amount: hint.closingBalance === null ? "" : fromMinorUnits(currency, printedStatementBalance(kind, hint.closingBalance)),
    },
    validators: {
      onSubmit: ({ value }) => (checkpointOf(currency, kind, value) ? undefined : "Enter a statement date and balance."),
    },
    onSubmit: async ({ value, formApi }) => {
      const body = checkpointOf(currency, kind, value);
      opening.reset();
      if (!body || !compare?.balanced) {
        setChecked(body);
        return;
      }
      try {
        await create.mutateAsync({ accountId, body });
        close();
      } catch (error) {
        setChecked(null);
        formApi.setErrorMap({
          onSubmit: {
            form: errorCode(error) === "checkpoint_unbalanced" ? "The balances changed. Check them again." : "The checkpoint did not save. Try again.",
            fields: {},
          },
        });
      }
    },
  });
  const uncheck = { onChange: () => setChecked(null) };
  const busy = check.isFetching || opening.isPending;

  const owed = accountClass(kind) === "liability";
  const help = compare && !compare.balanced ? compare.help : [];
  const uncleared = help.flatMap((item) => (item.code === "uncleared" ? [item.transaction] : []));
  const duplicates = help.flatMap((item) => (item.code === "duplicate" ? [item.transactions] : []));
  const gaps = help.flatMap((item) => (item.code === "gap" ? [item] : []));

  return (
    <form.AppForm>
      <DialogHeader>
        <DialogTitle>Reconcile</DialogTitle>
        <DialogDescription>Enter the statement date and the balance on that date.</DialogDescription>
      </DialogHeader>
      <form.FormShell>
        <DialogBody>
        <form.AppField name="date" listeners={uncheck}>
          {(field) => <field.DateInputField id="statement-date" label="Statement date" required />}
        </form.AppField>
        <form.AppField name="amount" listeners={uncheck}>
          {(field) => (
            <field.MoneyField
              id="statement-balance"
              label={owed ? "Amount you owed" : "Statement balance"}
              required
              description={owed ? "Enter the amount on the statement. Example: 12.50" : "Example: 12.50"}
            />
          )}
        </form.AppField>
        {compare?.balanced ? (
          <p role="status" className="text-sm font-semibold text-pos">
            Balanced. The book matches this statement.
          </p>
        ) : null}
        {compare && !compare.balanced ? (
          <div role="status" className="grid gap-3">
            <p className="text-sm">
              The book is off by <Amount minor={compare.difference} />. The book balance is{" "}
              <Amount minor={compare.calculatedBalance} owed={owed} />.
            </p>
            {uncleared.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Uncleared</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {uncleared.map((item) => (
                    <li key={item.id}>
                      {item.payee} · {formatDate(item.date)} · <Amount minor={item.amount} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {duplicates.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Possible duplicates</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {duplicates.map((pair) => (
                    <li key={`${pair[0].id}-${pair[1].id}`}>
                      {pair[0].payee} · {formatDate(pair[0].date)} and {pair[1].payee} · {formatDate(pair[1].date)} have
                      the same amount.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {gaps.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">No transactions</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {gaps.map((gap) => (
                    <li key={`${gap.from}-${gap.to}`}>
                      {formatDate(gap.from)} – {formatDate(gap.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {uncleared.length === 0 && duplicates.length === 0 && gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uncleared transactions, duplicates, or gaps were found.</p>
            ) : null}
            {compare.openingSuggestion ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const suggestion = compare.openingSuggestion;
                  if (suggestion) {
                    opening.mutate({ accountId, suggestion });
                  }
                }}
              >
                Set the opening balance so this statement balances
              </Button>
            ) : null}
          </div>
        ) : null}
        {checked && check.isError ? <FieldError>The balances did not load. Try again.</FieldError> : null}
        {opening.isError ? <FieldError>The opening balance did not save.</FieldError> : null}
        <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton disabled={busy}>{compare?.balanced ? "Save checkpoint" : "Check"}</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
