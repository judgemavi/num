import {
  accountClass,
  checkpointCompareSchema,
  checkpointCreateSchema,
  checkpointSchema,
  closingHintSchema,
  fromMinorUnits,
  printedStatementBalance,
  storedStatementBalance,
  toMinorUnits,
  type AccountKind,
  type CheckpointCompare,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { loadAccount, setOpeningBalance } from "@/accounts/opening-action";
import { apiRequest } from "@/request";
import { formatDate } from "@/transactions/format";

type ReconcileDialogProps = {
  accountId: string;
  currency: string;
  kind: AccountKind;
  onClose: () => void;
};

export function ReconcileDialog({ accountId, currency, kind, onClose }: ReconcileDialogProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [compare, setCompare] = useState<CheckpointCompare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hint = useQuery({
    queryKey: ["closing", accountId],
    queryFn: async () => {
      const result = await apiRequest(`/api/accounts/${accountId}/closing`, closingHintSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

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

  function body(): { date: string; statementBalance: number } | null {
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

  async function checkBalance() {
    const payload = body();
    if (!payload) {
      setError("Enter a statement date and balance.");
      setCompare(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest(`/api/accounts/${accountId}/checkpoints/compare`, checkpointCompareSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!result.ok) {
        setCompare(null);
        setError("The balances did not load. Try again.");
        return;
      }
      setCompare(result.data);
    } catch {
      setCompare(null);
      setError("The balances did not load. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckpoint() {
    const payload = body();
    if (!payload || !compare?.balanced) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest(`/api/accounts/${accountId}/checkpoints`, checkpointSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!result.ok) {
        setError(
          result.code === "checkpoint_unbalanced"
            ? "The balances changed. Check them again."
            : "The checkpoint did not save. Try again.",
        );
        setCompare(null);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["checkpoints", accountId] });
      await queryClient.invalidateQueries({ queryKey: ["account", accountId] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
      await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
      await queryClient.invalidateQueries({ queryKey: ["reconcile", accountId] });
      onClose();
    } catch {
      setError("The checkpoint did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

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
            void saveCheckpoint();
            return;
          }
          void checkBalance();
        }}
      >
        <DialogBody>
        <Field>
          <FieldLabel htmlFor="statement-date">Statement date</FieldLabel>
          <Input
            id="statement-date"
            type="date"
            value={date}
            required
            onChange={(event) => {
              setDate(event.target.value);
              setCompare(null);
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
              setCompare(null);
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
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  const suggestion = compare.openingSuggestion;
                  if (!suggestion) {
                    return;
                  }
                  void (async () => {
                    setSaving(true);
                    setError(null);
                    const account = await loadAccount(accountId);
                    if (!account || !suggestion) {
                      setSaving(false);
                      setError("The account did not load.");
                      return;
                    }
                    const code = await setOpeningBalance(account, suggestion);
                    setSaving(false);
                    if (code) {
                      setError("The opening balance did not save.");
                      return;
                    }
                    await queryClient.invalidateQueries({ queryKey: ["account", accountId] });
                    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
                    await checkBalance();
                  })();
                }}
              >
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
