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
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSetOpeningBalance } from "@/api/accounts";
import { closingHintQuery, useCompareCheckpoint, useCreateCheckpoint } from "@/api/checkpoints";
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
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/transactions/format";

type ReconcileDialogProps = {
  account: Account;
  currency: string;
  onClose: () => void;
};

export function ReconcileDialog({ account, currency, onClose }: ReconcileDialogProps) {
  const accountId = account.id;
  const kind = account.kind;
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const check = useCompareCheckpoint();
  const create = useCreateCheckpoint();
  const opening = useSetOpeningBalance();
  const compare = check.data ?? null;
  const saving = check.isPending || create.isPending || opening.isPending;
  const hint = useQuery(closingHintQuery(accountId));

  if (!seeded && hint.data) {
    if (hint.data.closingDate !== null && hint.data.closingBalance !== null) {
      setDate(hint.data.closingDate);
      setAmount(fromMinorUnits(currency, printedStatementBalance(kind, hint.data.closingBalance)));
    }
    setSeeded(true);
  }

  function parsedAmount(): number | null {
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
    check.reset();
    create.reset();
    opening.reset();
  }

  function checkBalance() {
    const payload = body();
    clearRequests();
    setInvalid(!payload);
    if (payload) {
      check.mutate({ accountId, body: payload });
    }
  }

  function saveCheckpoint() {
    const payload = body();
    if (!payload || !compare?.balanced) {
      return;
    }
    create.mutate({ accountId, body: payload }, { onSuccess: onClose, onError: () => check.reset() });
  }

  function setOpening() {
    const suggestion = compare?.openingSuggestion;
    if (!suggestion) {
      return;
    }
    opening.mutate({ account, suggestion }, { onSuccess: checkBalance });
  }

  function errorText(): string | null {
    if (invalid) {
      return "Enter a statement date and balance.";
    }
    if (check.isError) {
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
              check.reset();
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
              check.reset();
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
              The book is off by <Amount currency={currency} minor={compare.difference} />. The book balance is{" "}
              <Amount currency={currency} minor={compare.calculatedBalance} owed={owed} />.
            </p>
            {uncleared.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Uncleared</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {uncleared.map((item) => (
                    <li key={item.id}>
                      {item.payee} · {formatDate(item.date)} · <Amount currency={currency} minor={item.amount} />
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
