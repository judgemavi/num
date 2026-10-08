import {
  accountClass,
  accountCreateSchema,
  accountKinds,
  accountSchema,
  accountUpdateSchema,
  allowsInterestRate,
  defaultOnBudget,
  fromMinorUnits,
  milliPctToPercent,
  percentToMilliPct,
  toMinorUnits,
  type Account,
  type AccountKind,
  type PaymentPolicy,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { accountError, policyLabel } from "@/accounts/format";
import { KindPicker } from "@/accounts/kind-picker";
import { sameClassKinds } from "@/accounts/groups";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AccountFormProps = {
  initialName?: string;
  currency: string;
  account: Account | null;
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

export function AccountForm({ currency, account, initialName, onClose, onSaved }: AccountFormProps) {
  const [name, setName] = useState(account?.name ?? initialName ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "chequing");
  const [onBudget, setOnBudget] = useState(account?.onBudget ?? true);
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? "");
  const [openingBalance, setOpeningBalance] = useState(account ? fromMinorUnits(currency, account.openingBalance) : "");
  const [paymentPolicy, setPaymentPolicy] = useState<PaymentPolicy | null>(account?.paymentPolicy ?? null);
  const [fixedPayment, setFixedPayment] = useState(
    account?.fixedPayment === null || account?.fixedPayment === undefined ? "" : fromMinorUnits(currency, account.fixedPayment),
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRateMilliPct === null || account?.interestRateMilliPct === undefined
      ? ""
      : milliPctToPercent(account.interestRateMilliPct),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const liability = accountClass(kind) === "liability";
  const allowed = account ? sameClassKinds(account.kind) : accountKinds;

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let body: unknown;
    try {
      if (kind === "credit_card" && paymentPolicy === null) {
        setError("Choose how you pay this card.");
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
        ...(openingDate.trim().length === 0 ? {} : { openingDate }),
        ...(openingBalance.trim().length === 0
          ? {}
          : { openingBalance: readAmount(currency, openingBalance, liability ? "the amount you owed" : "the balance") }),
        interestRateMilliPct: allowsInterestRate(kind) ? readInterest(interestRate) : null,
        ...card,
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the account fields.");
      return;
    }

    const parsed = (account ? accountUpdateSchema : accountCreateSchema).safeParse(body);
    if (!parsed.success) {
      setError("Check the account fields.");
      return;
    }

    setSaving(true);
    try {
      const result = await apiRequest(account ? `/api/accounts/${account.id}` : "/api/accounts", accountSchema, {
        method: account ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!result.ok) {
        setError(accountError(result.code));
        return;
      }
      onSaved(result.data.id);
    } catch {
      setError("The account did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{account ? "Edit account" : "Add an account"}</DialogTitle>
        <DialogDescription>
          {account ? "Change the details of this account." : "Add an account to the book."}
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
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
            <FieldLabel htmlFor="opening-balance">{liability ? "Amount you owed" : "Balance"}</FieldLabel>
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
            <Input id="opening-date" type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground" style={{ marginTop: 0 }}>
          Leave the balance blank to start at 0. Leave the date blank to use today. Num counts forward from this date.
        </p>
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
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving account" : account ? "Save account" : "Add account"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
