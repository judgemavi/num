import {
  accountClass,
  accountCreateSchema,
  accountKinds,
  accountUpdateSchema,
  allowsInterestRate,
  balanceFromEntry,
  entryFromBalance,
  defaultOnBudget,
  fromMinorUnits,
  milliPctToPercent,
  percentToMilliPct,
  Temporal,
  toMinorUnits,
  type Account,
  type AccountKind,
  type MortgageTerms,
  type PaymentPolicy,
} from "@num/shared";
import { useState, type ReactNode } from "react";
import { accountError, policyLabel } from "@/accounts/format";
import { draftFromTerms, draftIsBlank, firstPaymentNotAfterOpening, termsFromDraft, type MortgageDraft } from "@/accounts/mortgage-draft";
import { MortgageSection, openingDateHelp } from "@/accounts/mortgage-section";
import { KindPicker } from "@/accounts/kind-picker";
import { sameClassKinds } from "@/accounts/groups";
import type { useSaveAccount } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { DialogBody, FormActions, FormCancel, FormHeading, FormShell } from "@/editors/form-chrome";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AccountFormProps = {
  initialName?: string;
  currency: string;
  account: Account | null;
  /** The saved terms of a mortgage account. Null when the account has none. */
  terms?: MortgageTerms | null;
  inline?: boolean;
  below?: ReactNode;
  /** The save mutation of the parent. The parent stays on the screen until the save ends, thus `onSaved` always runs. */
  save: ReturnType<typeof useSaveAccount>;
  onClose: () => void;
  onSaved: (id: string) => void;
};

function readAmount(currency: string, text: string, label: string): number {
  try {
    return toMinorUnits(currency, text.trim());
  } catch (error) {
    if (error instanceof Error && error.message === "Amount has too many decimal places") {
      throw new Error(`${label} has too many decimal places.`);
    }
    throw new Error(`Enter ${label} as a number.`);
  }
}

function readInterest(text: string): number | null {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return percentToMilliPct(text);
  } catch (error) {
    if (error instanceof Error && error.message === "Interest rate is too high") {
      throw new Error("Enter an interest rate from 0 to 1000.");
    }
    throw new Error("Enter the interest rate as a percent with up to 3 decimal places.");
  }
}

function isKind(value: string): value is AccountKind {
  return (accountKinds as readonly string[]).includes(value);
}

function isPolicy(value: string): value is PaymentPolicy {
  return value === "full" || value === "fixed" || value === "manual";
}

function localToday(): string {
  return Temporal.Now.plainDateISO().toString();
}

export function AccountForm({ currency, account, terms = null, initialName, inline = false, below, save, onClose, onSaved }: AccountFormProps) {
  const [name, setName] = useState(account?.name ?? initialName ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "chequing");
  const [onBudget, setOnBudget] = useState(account?.onBudget ?? true);
  const automaticDate = account?.automaticOpeningDate ?? localToday();
  const [automatic, setAutomatic] = useState(account ? account.openingAutomatic : true);
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? automaticDate);
  const [openingBalance, setOpeningBalance] = useState(account ? fromMinorUnits(currency, entryFromBalance(account.kind, account.openingBalance)) : "");
  const [paymentPolicy, setPaymentPolicy] = useState<PaymentPolicy | null>(account?.paymentPolicy ?? null);
  const [fixedPayment, setFixedPayment] = useState(
    account?.fixedPayment === null || account?.fixedPayment === undefined ? "" : fromMinorUnits(currency, account.fixedPayment),
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRateMilliPct === null || account?.interestRateMilliPct === undefined
      ? ""
      : milliPctToPercent(account.interestRateMilliPct),
  );
  const [mortgage, setMortgage] = useState<MortgageDraft>(() => draftFromTerms(currency, terms));
  const [invalid, setInvalid] = useState<string | null>(null);
  const saving = save.isPending;
  const error = invalid ?? (save.error ? accountError(errorCode(save.error)) : null);
  const liability = accountClass(kind) === "liability";
  const hasSection = kind === "mortgage" && !inline;
  const termsOn = hasSection && !draftIsBlank(mortgage);
  const allowed = account ? sameClassKinds(account.kind) : accountKinds;

  function changeOpeningDate(value: string) {
    setOpeningDate(value);
    setAutomatic(false);
  }

  function useAutomaticDate() {
    setAutomatic(true);
    setOpeningDate(automaticDate);
  }

  function changeKind(value: string) {
    if (!isKind(value)) {
      return;
    }
    setKind(value);
    setOnBudget(defaultOnBudget(value));
    if (value !== "credit_card") {
      setPaymentPolicy(null);
      setFixedPayment("");
    }
    if (!allowsInterestRate(value)) {
      setInterestRate("");
    }
  }

  function saveInput(body: unknown) {
    if (account) {
      const parsed = accountUpdateSchema.safeParse(body);
      return parsed.success ? { id: account.id, body: parsed.data } : null;
    }
    const parsed = accountCreateSchema.safeParse(body);
    return parsed.success ? { id: null, body: parsed.data } : null;
  }

  function onSubmit() {
    setInvalid(null);
    let body: unknown;
    try {
      if (kind === "credit_card" && paymentPolicy === null) {
        setInvalid("Choose how you pay this card.");
        return;
      }
      if ((!automatic || termsOn) && openingDate.trim().length === 0) {
        setInvalid("Enter the date, or use the automatic date.");
        return;
      }
      if (termsOn && firstPaymentNotAfterOpening(openingDate, mortgage)) {
        setInvalid("The first payment must be after the opening date.");
        return;
      }
      if (termsOn && (openingBalance.trim().length === 0 || readAmount(currency, openingBalance, "the amount owed") === 0)) {
        setInvalid("Enter the amount owed on the opening date.");
        return;
      }
      const card =
        kind === "credit_card"
          ? {
              paymentPolicy,
              fixedPayment: paymentPolicy === "fixed" ? readAmount(currency, fixedPayment, "the fixed payment") : null,
            }
          : {
              paymentPolicy: null,
              fixedPayment: null,
            };
      body = {
        name,
        institution: institution.trim().length === 0 ? null : institution.trim(),
        kind,
        onBudget,
        openingDate: automatic && !termsOn ? null : openingDate,
        ...(openingBalance.trim().length === 0
          ? {}
          : {
              openingBalance: balanceFromEntry(
                kind,
                readAmount(currency, openingBalance, liability ? "the amount owed" : "the balance"),
              ),
            }),
        interestRateMilliPct: allowsInterestRate(kind) ? readInterest(interestRate) : null,
        ...card,
        ...(hasSection ? { mortgageTerms: termsFromDraft(currency, mortgage) } : {}),
      };
    } catch (caught) {
      setInvalid(caught instanceof Error ? caught.message : "Check the account fields.");
      return;
    }

    const input = saveInput(body);
    if (!input) {
      setInvalid("Check the account fields.");
      return;
    }
    save.mutate(input, { onSuccess: (saved) => onSaved(saved.id) });
  }

  return (
    <>
      <FormHeading
        inline={inline}
        title={account ? "Edit account" : "Add an account"}
        description={account ? "Change the details of this account." : "Add an account to the book."}
      />
      <FormShell inline={inline} className="grid gap-4" onSubmit={onSubmit}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
        <Field>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input id="account-name" value={name} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-institution">Institution</FieldLabel>
          <Input id="account-institution" value={institution} onChange={(event) => setInstitution(event.target.value)} />
        </Field>
        <KindPicker kind={kind} allowed={allowed} onChange={changeKind} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="opening-balance">{liability ? "Amount owed" : "Balance"}</FieldLabel>
            <Input
              id="opening-balance"
              inputMode="decimal"
              autoComplete="off"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opening-date">On this date</FieldLabel>
            <DateField id="opening-date" value={openingDate} onChange={changeOpeningDate} />
            {termsOn ? (
              <FieldDescription>{openingDateHelp}</FieldDescription>
            ) : automatic ? (
              <FieldDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">Automatic</Badge>
                {account?.automaticFollowsTransactions
                  ? "This date follows the first transaction."
                  : "Num uses today until you add transactions."}
              </FieldDescription>
            ) : (
              <Button type="button" variant="link" className="h-11 min-h-11 justify-start px-0" onClick={useAutomaticDate}>
                Use automatic date
              </Button>
            )}
          </Field>
        </div>
        <p className="text-sm text-muted-foreground" style={{ marginTop: 0 }}>
          Leave the balance blank to start at 0. Num counts forward from this date.
        </p>
        {hasSection ? (
          <MortgageSection
            accountId={account?.id ?? null}
            openingDate={openingDate}
            draft={mortgage}
            onChange={setMortgage}
            onClear={() => setMortgage(draftFromTerms(currency, null))}
          />
        ) : null}
        {kind === "credit_card" ? (
          <>
            <Field>
              <FieldLabel htmlFor="payment-policy">How you pay</FieldLabel>
              <Select
                value={paymentPolicy ?? undefined}
                onValueChange={(value) => {
                  if (!isPolicy(value)) {
                    return;
                  }
                  setPaymentPolicy(value);
                  if (value !== "fixed") {
                    setFixedPayment("");
                  }
                }}
              >
                <SelectTrigger id="payment-policy" className="w-full">
                  <SelectValue placeholder="Choose how you pay" />
                </SelectTrigger>
                <SelectContent>
                  {(["full", "fixed", "manual"] as const).map((policy) => (
                    <SelectItem key={policy} value={policy}>
                      {policyLabel(policy)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {paymentPolicy === "fixed" ? (
              <Field>
                <FieldLabel htmlFor="fixed-payment">Fixed payment</FieldLabel>
                <Input
                  id="fixed-payment"
                  inputMode="decimal"
                  autoComplete="off"
                  value={fixedPayment}
                  required
                  onChange={(event) => setFixedPayment(event.target.value)}
                />
              </Field>
            ) : null}
          </>
        ) : null}
        <Collapsible>
          <CollapsibleTrigger className="group flex min-h-11 items-center gap-1.5 font-semibold text-primary">
            <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" strokeWidth={1.8} />
            More details
          </CollapsibleTrigger>
          <CollapsibleContent>
          <div className="grid gap-4">
            {allowsInterestRate(kind) ? (
              <Field>
                <FieldLabel htmlFor="interest-rate">Interest rate (%)</FieldLabel>
                <Input
                  id="interest-rate"
                  inputMode="decimal"
                  autoComplete="off"
                  value={interestRate}
                  placeholder="6.875"
                  onChange={(event) => setInterestRate(event.target.value)}
                />
              </Field>
            ) : null}
            <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <FieldLabel htmlFor="on-budget">Use this account's money in my budget</FieldLabel>
              <Switch id="on-budget" checked={onBudget} onCheckedChange={(checked) => setOnBudget(checked === true)} />
            </div>
          </div>
          </CollapsibleContent>
        </Collapsible>
        {error ? <FieldError>{error}</FieldError> : null}
        {below}
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel inline={inline} onClose={onClose}>
            Cancel
          </FormCancel>
          <Button type={inline ? "button" : "submit"} disabled={saving} onClick={inline ? onSubmit : undefined}>
            {saving ? "Saving account" : account ? "Save account" : "Add account"}
          </Button>
        </FormActions>
      </FormShell>
    </>
  );
}
