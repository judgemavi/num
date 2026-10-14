import { fromMinorUnits, toMinorUnits, type FundingProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent, type ReactNode } from "react";
import { errorCode } from "@/api/client";
import { fundingPaychecksQuery, fundingProposalQuery, useFundPaycheck } from "@/api/funding";
import { localAsOf } from "@/as-of";
import { bucketError, formatDate, requestError } from "@/buckets/format";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogForm, DialogPanel } from "@/editors/form-chrome";
import { useBookCurrency } from "@/editors/lookups";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FundPaycheck({ incomeTransactionId }: EditorInput["fundPaycheck"]) {
  const [chosen, setChosen] = useState<string | null>(null);
  const { data: paychecks } = useSuspenseQuery(fundingPaychecksQuery());
  const selected = chosen ?? incomeTransactionId ?? paychecks[0]?.incomeTransactionId ?? null;

  const picker = (
    <>
      {paychecks.length === 0 ? <p>No paycheck is ready to fund. Link an income deposit that funds buckets.</p> : null}
      {paychecks.length > 1 ? (
        <Field>
          <FieldLabel htmlFor="fund-paycheck">Paycheck</FieldLabel>
          <Select value={selected ?? undefined} onValueChange={setChosen}>
            <SelectTrigger id="fund-paycheck" className="w-full">
              <SelectValue placeholder="Choose a paycheck" />
            </SelectTrigger>
            <SelectContent>
              {paychecks.map((item) => (
                <SelectItem key={item.incomeTransactionId} value={item.incomeTransactionId}>
                  {item.payee} · {formatDate(item.date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </>
  );

  /** The dialog with no proposal: the paycheck picker, a text, and a Close button. */
  function panel(content: ReactNode) {
    return (
      <DialogPanel>
        <DialogBody>
          {picker}
          {content}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogPanel>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fund this paycheck</DialogTitle>
        <DialogDescription>Assign this deposit to buckets. You can change the amounts before you confirm.</DialogDescription>
      </DialogHeader>
      {selected ? (
        <Boundary loading="Loading the proposal." failed={({ error }) => bucketError(errorCode(error))} frame={panel} resetKey={selected}>
          <Proposal leading={picker} incomeTransactionId={selected} />
        </Boundary>
      ) : (
        panel(null)
      )}
    </>
  );
}

function Proposal({ leading, incomeTransactionId }: { leading: ReactNode; incomeTransactionId: string }) {
  // The proposal of the paycheck before stays on the screen while the proposal of a new paycheck loads.
  const shown = useDeferredValue(incomeTransactionId);
  const { data: proposal } = useSuspenseQuery(fundingProposalQuery(shown, localAsOf()));
  return (
    <ProposalForm
      key={`${proposal.incomeTransactionId}:${proposal.lines.map((line) => line.amount).join(",")}`}
      leading={leading}
      proposal={proposal}
    />
  );
}

function ProposalForm({ leading, proposal }: { leading: ReactNode; proposal: FundingProposal }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const fund = useFundPaycheck();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of proposal.lines) {
      initial[line.bucketId] = fromMinorUnits(currency, line.amount);
    }
    return initial;
  });
  const [invalid, setInvalid] = useState<string | null>(null);
  const error = invalid ?? (fund.error ? requestError(fund.error, "The paycheck was not funded. Try again.") : null);

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
    fund.mutate({ asOf: localAsOf(), body: { incomeTransactionId: proposal.incomeTransactionId, lines } }, { onSuccess: () => close("ok") });
  }

  return (
    <DialogForm onSubmit={onSubmit}>
      <DialogBody>
      {leading}
      <p className="text-sm text-muted-foreground">
        {proposal.payee} · {formatDate(proposal.date)}. Assign up to <Amount minor={proposal.limit} />. That is the smaller of the paycheck and Unassigned.
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
        <Button type="submit" disabled={fund.isPending || proposal.lines.length === 0}>
          Fund this paycheck
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
