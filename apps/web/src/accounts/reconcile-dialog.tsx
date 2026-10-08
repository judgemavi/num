import {
  accountClass,
  checkpointCompareSchema,
  checkpointCreateSchema,
  checkpointSchema,
  closingHintSchema,
  fromMinorUnits,
  toMinorUnits,
  transactionListSchema,
  type AccountKind,
  type CheckpointCompare,
  type CheckpointHelp,
  type TransactionListItem,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/request";
import { formatDate } from "@/transactions/format";
import { transactionPath } from "@/transactions/query";

type ReconcileDialogProps = {
  accountId: string;
  currency: string;
  kind: AccountKind;
  onClose: () => void;
};

function helpTransactions(items: TransactionListItem[], help: CheckpointHelp[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    uncleared: help.flatMap((item) => (item.code === "uncleared" ? [byId.get(item.transactionId)] : [])),
    duplicates: help.flatMap((item) =>
      item.code === "duplicate" ? [[byId.get(item.transactionIds[0]), byId.get(item.transactionIds[1])] as const] : [],
    ),
    gaps: help.flatMap((item) => (item.code === "gap" ? [item] : [])),
  };
}

async function loadTransactions(accountId: string): Promise<TransactionListItem[]> {
  const items: TransactionListItem[] = [];
  let page = 1;
  for (;;) {
    const result = await apiRequest(
      transactionPath({ page, pageSize: 200, accountId, uncategorized: false }),
      transactionListSchema,
    );
    if (!result.ok) {
      throw new Error(result.code);
    }
    items.push(...result.data.items);
    if (items.length >= result.data.total || result.data.items.length === 0) {
      return items;
    }
    page += 1;
  }
}

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
      setAmount(fromMinorUnits(currency, hint.data.closingBalance));
    }
    setSeeded(true);
  }

  const known = useQuery({
    queryKey: ["reconcile-transactions", accountId],
    enabled: compare !== null && !compare.balanced,
    queryFn: () => loadTransactions(accountId),
  });

  function parsedAmount(): number | null {
    try {
      return toMinorUnits(currency, amount.trim());
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
      onClose();
    } catch {
      setError("The checkpoint did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const lists =
    compare && !compare.balanced && known.data ? helpTransactions(known.data, compare.help) : null;
  const owed = accountClass(kind) === "liability";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reconcile</DialogTitle>
        <DialogDescription>Enter the statement date and the balance on that date.</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (compare?.balanced) {
            void saveCheckpoint();
            return;
          }
          void checkBalance();
        }}
      >
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
          <FieldLabel htmlFor="statement-balance">Statement balance</FieldLabel>
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
            {owed ? "Use a minus sign for money you owe. Example: -12.50" : "Example: 12.50"}
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
            {lists && lists.uncleared.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Uncleared</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {lists.uncleared.map((item) =>
                    item ? (
                      <li key={item.id}>
                        {item.payeeRaw} · {formatDate(item.date)} · <Amount currency={currency} minor={item.amount} />
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            ) : null}
            {lists && lists.duplicates.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Possible duplicates</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {lists.duplicates.map((pair) => (
                    <li key={`${pair[0]?.id ?? "missing"}-${pair[1]?.id ?? "missing"}`}>
                      {pair[0] ? `${pair[0].payeeRaw} · ${formatDate(pair[0].date)}` : "A transaction"} and{" "}
                      {pair[1] ? `${pair[1].payeeRaw} · ${formatDate(pair[1].date)}` : "a transaction"} have the same
                      amount.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lists && lists.gaps.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">No transactions</h3>
                <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
                  {lists.gaps.map((gap) => (
                    <li key={`${gap.from}-${gap.to}`}>
                      {formatDate(gap.from)} – {formatDate(gap.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lists && lists.uncleared.length === 0 && lists.duplicates.length === 0 && lists.gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uncleared transactions, duplicates, or gaps were found.</p>
            ) : null}
          </div>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
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
      </form>
    </>
  );
}
