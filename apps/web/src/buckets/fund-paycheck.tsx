import {
  type ErrorCode,
  fromMinorUnits,
  fundingPaycheckListSchema,
  fundingProposalSchema,
  fundingRunSchema,
  toMinorUnits,
  type FundingProposal,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { bucketError, formatDate } from "@/buckets/format";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FundPaycheckProps = {
  currency: string;
  asOf: string;
  onClose: () => void;
  onSaved: () => void;
};

export function FundPaycheck({ currency, asOf, onClose, onSaved }: FundPaycheckProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const paychecks = useQuery({
    queryKey: ["funding-paychecks"],
    queryFn: async () => {
      const result = await apiRequest("/api/funding/paychecks", fundingPaycheckListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
  const selected = chosen ?? paychecks.data?.[0]?.incomeTransactionId ?? null;
  const proposal = useQuery({
    queryKey: ["funding-proposal", selected, asOf],
    enabled: selected !== null,
    queryFn: async () => {
      const params = new URLSearchParams({ asOf, incomeTransactionId: selected ?? "" });
      const result = await apiRequest(`/api/funding/proposal?${params.toString()}`, fundingProposalSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Fund this paycheck</DialogTitle>
        <DialogDescription>Assign this deposit to buckets. You can change the amounts before you confirm.</DialogDescription>
      </DialogHeader>
      {paychecks.isPending ? <p className="text-muted-foreground">Loading paychecks.</p> : null}
      {paychecks.isError ? (
        <div className="grid gap-3">
          <p>The paychecks did not load.</p>
          <Button type="button" onClick={() => void paychecks.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {paychecks.data && paychecks.data.length === 0 ? <p>No paycheck is ready to fund. Link an income deposit that funds buckets.</p> : null}
      {paychecks.data && paychecks.data.length > 1 ? (
        <Field>
          <FieldLabel htmlFor="fund-paycheck">Paycheck</FieldLabel>
          <Select value={selected ?? undefined} onValueChange={setChosen}>
            <SelectTrigger id="fund-paycheck" className="w-full">
              <SelectValue placeholder="Choose a paycheck" />
            </SelectTrigger>
            <SelectContent>
              {paychecks.data.map((item) => (
                <SelectItem key={item.incomeTransactionId} value={item.incomeTransactionId}>
                  {item.payee} · {formatDate(item.date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {proposal.isPending && selected ? <p className="text-muted-foreground">Loading the proposal.</p> : null}
      {proposal.isError ? (
        <div className="grid gap-3">
          <p>{proposal.error instanceof Error ? bucketError(proposal.error.message as ErrorCode) : "The proposal did not load."}</p>
          <Button type="button" onClick={() => void proposal.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {proposal.data ? (
        <ProposalForm key={`${proposal.data.incomeTransactionId}:${proposal.data.lines.map((line) => line.amount).join(",")}`} currency={currency} asOf={asOf} proposal={proposal.data} onClose={onClose} onSaved={onSaved} />
      ) : (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}

function ProposalForm({
  currency,
  asOf,
  proposal,
  onClose,
  onSaved,
}: {
  currency: string;
  asOf: string;
  proposal: FundingProposal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of proposal.lines) {
      initial[line.bucketId] = fromMinorUnits(currency, line.amount);
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const lines = [];
    let sum = 0;
    for (const line of proposal.lines) {
      const text = amounts[line.bucketId]?.trim() ?? "";
      if (text === "") {
        continue;
      }
      let minor = 0;
      try {
        minor = toMinorUnits(currency, text);
      } catch {
        setError("Enter each amount as a number.");
        return;
      }
      if (minor < 0) {
        setError("Enter an amount of zero or more.");
        return;
      }
      if (minor === 0) {
        continue;
      }
      lines.push({ bucketId: line.bucketId, amount: minor });
      sum += minor;
    }
    if (lines.length === 0) {
      setError("Enter an amount for at least one bucket.");
      return;
    }
    if (sum > proposal.limit) {
      setError("That is more than this paycheck can assign.");
      return;
    }
    setSaving(true);
    try {
      const params = new URLSearchParams({ asOf });
      const result = await apiRequest(`/api/funding/runs?${params.toString()}`, fundingRunSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incomeTransactionId: proposal.incomeTransactionId, lines }),
      });
      if (!result.ok) {
        setError(bucketError(result.code));
        return;
      }
      onSaved();
    } catch {
      setError("The paycheck was not funded. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      <p className="text-sm text-muted-foreground">
        {proposal.payee} · {formatDate(proposal.date)}. Assign up to <Amount currency={currency} minor={proposal.limit} />. That is the smaller of the paycheck and Unassigned.
      </p>
      {proposal.lines.length === 0 ? <p>Nothing to assign. The buckets are full, or Unassigned is zero.</p> : null}
      {proposal.lines.map((line) => (
        <Field key={line.bucketId}>
          <FieldLabel htmlFor={`fund-${line.bucketId}`}>{line.name}</FieldLabel>
          <Input
            id={`fund-${line.bucketId}`}
            inputMode="decimal"
            value={amounts[line.bucketId] ?? ""}
            onChange={(event) => setAmounts((current) => ({ ...current, [line.bucketId]: event.target.value }))}
          />
        </Field>
      ))}
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || proposal.lines.length === 0}>
          Fund this paycheck
        </Button>
      </DialogFooter>
    </form>
  );
}
