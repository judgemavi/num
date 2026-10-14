import {
  accountClass,
  checkpointCreateSchema,
  fromMinorUnits,
  printedStatementBalance,
  storedStatementBalance,
  toMinorUnits,
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
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/transactions/format";

export function ReconcileDialog({ accountId }: EditorInput["reconcile"]) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const [{ data: account }, { data: hint }] = useSuspenseQueries({ queries: [accountQuery(accountId), closingHintQuery(accountId)] });
  const kind = account.kind;
  // The form starts with the closing date and the closing balance of the last imported statement.
  const closing = hint.closingDate !== null && hint.closingBalance !== null ? { date: hint.closingDate, balance: hint.closingBalance } : null;
  const [date, setDate] = useState(closing?.date ?? "");
  const [amount, setAmount] = useState(closing ? fromMinorUnits(currency, printedStatementBalance(kind, closing.balance)) : "");
  const [invalid, setInvalid] = useState(false);
  // The values that the user sent with "Check". The compare read runs for them. An edit of a value clears them.
  const [checked, setChecked] = useState<CheckpointCreate | null>(null);
  const check = useQuery({ ...checkpointCompareQuery(accountId, checked ?? { date: "", statementBalance: 0 }), enabled: checked !== null });
  const create = useCreateCheckpoint();
  const opening = useSetOpeningBalance();
  const compare = checked ? (check.data ?? null) : null;
  const saving = check.isFetching || create.isPending || opening.isPending;

  function parsedAmount() {
    try {
      return storedStatementBalance(kind, toMinorUnits(currency, amount.trim()));
    } catch {
      return null;
    }
  }

  function body(): CheckpointCreate | null {
    const statementBalance = parsedAmount();
    const parsed = checkpointCreateSchema.safeParse({
      date,
      statementBalance: statementBalance ?? 0,
    });
    if (statementBalance === null || !parsed.success) {
      return null;
    }
    return parsed.data;
  }

  /** Remove the result and the error of each request. A new step starts with no old message. */
  function clearRequests() {
    create.reset();
    opening.reset();
  }

  function checkBalance() {
    const payload = body();
    clearRequests();
    setInvalid(!payload);
    setChecked(payload);
  }

  function saveCheckpoint() {
    const payload = body();
    if (!payload || !compare?.balanced) {
      return;
    }
    create.mutate({ accountId, body: payload }, { onSuccess: () => close(), onError: () => setChecked(null) });
  }

  function setOpening() {
    const suggestion = compare?.openingSuggestion;
    if (!suggestion) {
      return;
    }
    opening.mutate({ accountId, suggestion });
  }

  function errorText() {
    if (invalid) {
      return "Enter a statement date and balance.";
    }
    if (checked && check.isError) {
      return "The balances did not load. Try again.";
    }
    if (opening.isError) {
      return "The opening balance did not save.";
    }
    if (create.error) {
      return errorCode(create.error) === "checkpoint_unbalanced" ? "The balances changed. Check them again." : "The checkpoint did not save. Try again.";
    }
    return null;
  }

  const error = errorText();

  const owed = accountClass(kind) === "liability";
  const help = compare && !compare.balanced ? compare.help : [];
  const uncleared = help.flatMap((item) => (item.code === "uncleared" ? [item.transaction] : []));
  const duplicates = help.flatMap((item) => (item.code === "duplicate" ? [item.transactions] : []));
  const gaps = help.flatMap((item) => (item.code === "gap" ? [item] : []));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reconcile</DialogTitle>
        <DialogDescription>Enter the statement date and the balance on that date.</DialogDescription>
      </DialogHeader>
      <DialogForm
        onSubmit={(event) => {
          event.preventDefault();
          if (compare?.balanced) {
            saveCheckpoint();
            return;
          }
          checkBalance();
        }}
      >
        <DialogBody>
        <Field>
          <FieldLabel htmlFor="statement-date">Statement date</FieldLabel>
          <DateField
            id="statement-date"
            value={date}
            required
            onChange={(value) => {
              setDate(value);
              setChecked(null);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="statement-balance">{owed ? "Amount you owed" : "Statement balance"}</FieldLabel>
          <Input
            id="statement-balance"
            inputMode="decimal"
            value={amount}
            required
            onChange={(event) => {
              setAmount(event.target.value);
              setChecked(null);
            }}
          />
          <FieldDescription>
            {owed ? "Enter the amount on the statement. Example: 12.50" : "Example: 12.50"}
          </FieldDescription>
        </Field>
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
              <Button type="button" variant="outline" disabled={saving} onClick={setOpening}>
                Set the opening balance so this statement balances
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          {compare?.balanced ? (
            <Button type="submit" disabled={saving}>
              Save checkpoint
            </Button>
          ) : (
            <Button type="submit" disabled={saving}>
              Check
            </Button>
          )}
        </DialogFooter>
      </DialogForm>
    </>
  );
}
