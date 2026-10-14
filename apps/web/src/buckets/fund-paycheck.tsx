import { fromMinorUnits, toMinorUnits, type FundingProposal, type FundingRunCreate } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { errorCode } from "@/api/client";
import { fundingPaychecksQuery, fundingProposalQuery, useFundPaycheck } from "@/api/funding";
import { bucketError, formatDate, requestError } from "@/buckets/format";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm, DialogPanel } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FundPaycheckProps = {
  currency: string;
  asOf: string;
  incomeTransactionId?: string;
  onSaved: () => void;
};

export function FundPaycheck({ currency, asOf, incomeTransactionId, onSaved }: FundPaycheckProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const fund = useFundPaycheck();
  const paychecks = useQuery(fundingPaychecksQuery());
  const selected = chosen ?? incomeTransactionId ?? paychecks.data?.[0]?.incomeTransactionId ?? null;
  // The proposal of a funded paycheck gives an error. Thus this read stops when the funding starts.
  const proposal = useQuery(fundingProposalQuery(selected, asOf, fund.isIdle || fund.isError));

  const status = (
    <>
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
          <Select
            value={selected ?? undefined}
            onValueChange={(value) => {
              fund.reset();
              setChosen(value);
            }}
          >
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
          <p>{bucketError(errorCode(proposal.error))}</p>
          <Button type="button" onClick={() => void proposal.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fund this paycheck</DialogTitle>
        <DialogDescription>Assign this deposit to buckets. You can change the amounts before you confirm.</DialogDescription>
      </DialogHeader>
      {proposal.data ? (
        <ProposalForm
          key={`${proposal.data.incomeTransactionId}:${proposal.data.lines.map((line) => line.amount).join(",")}`}
          leading={status}
          currency={currency}
          proposal={proposal.data}
          pending={fund.isPending}
          failure={fund.error}
          onFund={(lines) => fund.mutate({ asOf, body: { incomeTransactionId: proposal.data.incomeTransactionId, lines } }, { onSuccess: onSaved })}
        />
      ) : (
        <DialogPanel>
          <DialogBody>{status}</DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogPanel>
      )}
    </>
  );
}

function ProposalForm({
  leading,
  currency,
  proposal,
  pending,
  failure,
  onFund,
}: {
  leading: ReactNode;
  currency: string;
  proposal: FundingProposal;
  pending: boolean;
  failure: Error | null;
  onFund: (lines: FundingRunCreate["lines"]) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of proposal.lines) {
      initial[line.bucketId] = fromMinorUnits(currency, line.amount);
    }
    return initial;
  });
  const [invalid, setInvalid] = useState<string | null>(null);
  const error = invalid ?? (failure ? requestError(failure, "The paycheck was not funded. Try again.") : null);

  function onSubmit(event: FormEvent) {
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
        setInvalid("Enter each amount as a number.");
        return;
      }
      if (minor < 0) {
        setInvalid("Enter an amount of zero or more.");
        return;
      }
      if (minor === 0) {
        continue;
      }
      lines.push({ bucketId: line.bucketId, amount: minor });
      sum += minor;
    }
    if (lines.length === 0) {
      setInvalid("Enter an amount for at least one bucket.");
      return;
    }
    if (sum > proposal.limit) {
      setInvalid("That is more than this paycheck can assign.");
      return;
    }
    setInvalid(null);
    onFund(lines);
  }

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogBody>
      {leading}
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
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || proposal.lines.length === 0}>
          Fund this paycheck
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
