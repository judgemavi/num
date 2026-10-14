import { amountText, parseAmount, type FundingProposal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type ReactNode } from "react";
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
import { DialogBody, DialogPanel } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { useBookCurrency } from "@/editors/lookups";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { decimalsError } from "@/money";

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

/** The amounts of a proposal. An empty amount or zero leaves the bucket out. */
function fundingLines(currency: string, proposal: FundingProposal, amounts: Record<string, string>) {
  const lines = [];
  let sum = 0;
  for (const line of proposal.lines) {
    const text = amounts[line.bucketId]?.trim() ?? "";
    if (text === "") {
      continue;
    }
    let milli = 0;
    try {
      milli = parseAmount(currency, text);
    } catch {
      return { error: decimalsError(currency, text) ?? "Enter each amount as a number." };
    }
    if (milli < 0) {
      return { error: "Enter an amount of zero or more." };
    }
    if (milli > 0) {
      lines.push({ bucketId: line.bucketId, amount: milli });
      sum += milli;
    }
  }
  if (lines.length === 0) {
    return { error: "Enter an amount for at least one bucket." };
  }
  return sum > proposal.limit ? { error: "That is more than this paycheck can assign." } : { lines };
}

function ProposalForm({ leading, proposal }: { leading: ReactNode; proposal: FundingProposal }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const fund = useFundPaycheck();
  const form = useAppForm({
    defaultValues: { amounts: Object.fromEntries(proposal.lines.map((line) => [line.bucketId, amountText(line.amount)])) },
    validators: {
      onSubmit: ({ value }) => fundingLines(currency, proposal, value.amounts).error,
    },
    onSubmit: async ({ value, formApi }) => {
      const { lines } = fundingLines(currency, proposal, value.amounts);
      if (!lines) {
        return;
      }
      try {
        await fund.mutateAsync({ asOf: localAsOf(), body: { incomeTransactionId: proposal.incomeTransactionId, lines } });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "The paycheck was not funded. Try again."), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogBody>
          {leading}
          <p className="text-sm text-muted-foreground">
            {proposal.payee} · {formatDate(proposal.date)}. Assign up to <Amount value={proposal.limit} />. That is the smaller of the paycheck and Unassigned.
          </p>
          {proposal.lines.length === 0 ? <p>Nothing to assign. The buckets are full, or Unassigned is zero.</p> : null}
          {proposal.lines.map((line) => (
            <form.AppField key={line.bucketId} name={`amounts.${line.bucketId}`}>
              {(field) => <field.MoneyField id={`fund-${line.bucketId}`} label={line.name} />}
            </form.AppField>
          ))}
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton disabled={proposal.lines.length === 0}>Fund this paycheck</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
