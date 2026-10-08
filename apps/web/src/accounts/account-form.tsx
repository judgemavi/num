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
  Temporal,
  type Account,
  type AccountKind,
  type PaymentPolicy,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { accountError, dayOptionLabel, policyLabel } from "@/accounts/format";
import { KindPicker } from "@/accounts/kind-picker";
import { sameClassKinds } from "@/accounts/groups";
import { apiRequest } from "@/request";
import { Button } from "@/components/button";
import { Disclosure } from "@/components/disclosure";
import { Reveal } from "@/components/reveal";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AccountFormProps = {
  currency: string;
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
};

const days = Array.from({ length: 31 }, (_, index) => index + 1);
const none = "none";

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

function readOptionalAmount(currency: string, text: string, label: string): number | null {
  if (text.trim().length === 0) {
    return null;
  }
  return readAmount(currency, text, label);
}

function readDay(text: string, label: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d{1,2}$/.test(trimmed)) {
    throw new Error(`Enter ${label} as a day from 1 to 31.`);
  }
  const day = Number(trimmed);
  if (day < 1 || day > 31) {
    throw new Error(`Enter ${label} as a day from 1 to 31.`);
  }
  return day;
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

export function AccountForm({ currency, account, onClose, onSaved }: AccountFormProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "chequing");
  const [onBudget, setOnBudget] = useState(account?.onBudget ?? true);
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? Temporal.Now.plainDateISO().toString());
  const [openingBalance, setOpeningBalance] = useState(account ? fromMinorUnits(currency, account.openingBalance) : "");
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit === null || account?.creditLimit === undefined ? "" : fromMinorUnits(currency, account.creditLimit),
  );
  const [statementDay, setStatementDay] = useState(
    account?.statementDay === null || account?.statementDay === undefined ? "" : String(account.statementDay),
  );
  const [dueDay, setDueDay] = useState(
    account?.dueDay === null || account?.dueDay === undefined ? "" : String(account.dueDay),
  );
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
      setCreditLimit("");
      setStatementDay("");
      setDueDay("");
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
              creditLimit: readOptionalAmount(currency, creditLimit, "the credit limit"),
              statementDay: readDay(statementDay, "the statement day"),
              dueDay: readDay(dueDay, "the due day"),
              paymentPolicy,
              fixedPayment: paymentPolicy === "fixed" ? readAmount(currency, fixedPayment, "the fixed payment") : null,
            }
          : {
              creditLimit: null,
              statementDay: null,
              dueDay: null,
              paymentPolicy: null,
              fixedPayment: null,
            };
      body = {
        name,
        institution: institution.trim().length === 0 ? null : institution.trim(),
        kind,
        onBudget,
        openingDate,
        openingBalance: readAmount(currency, openingBalance, liability ? "the amount you owed" : "the balance"),
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
      onSaved();
    } catch {
      setError("The account did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const moreLabel = kind === "credit_card" ? "More options: credit limit, interest rate, budget" : allowsInterestRate(kind) ? "More options: interest rate, budget" : "More options: budget";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{account ? "Edit account" : "Add an account"}</DialogTitle>
        <DialogDescription>
          {account ? "Change the details of this account." : "Add an account to the book."}
        </DialogDescription>
      </DialogHeader>
      <form className="form-grid" onSubmit={(event) => void onSubmit(event)}>
        <Field>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input id="account-name" value={name} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-institution">Institution</FieldLabel>
          <Input id="account-institution" value={institution} onChange={(event) => setInstitution(event.target.value)} />
        </Field>
        <KindPicker kind={kind} allowed={allowed} onChange={changeKind} />
        <div className="two">
          <Field>
            <FieldLabel htmlFor="opening-balance">{liability ? "Amount you owed" : "Balance"}</FieldLabel>
            <Input
              id="opening-balance"
              inputMode="decimal"
              autoComplete="off"
              value={openingBalance}
              required
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="opening-date">On this date</FieldLabel>
            <Input id="opening-date" type="date" value={openingDate} required onChange={(event) => setOpeningDate(event.target.value)} />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Use a balance from a statement. Num counts forward from this date.
        </p>
        {kind === "credit_card" ? (
          <Reveal title="Card details">
            <div className="two">
              <DayField id="statement-day" label="Statement ends on" value={statementDay} onChange={setStatementDay} />
              <DayField id="due-day" label="Payment is due on" value={dueDay} onChange={setDueDay} />
            </div>
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
          </Reveal>
        ) : null}
        <Disclosure label={moreLabel}>
          <div className="form-grid">
            {kind === "credit_card" ? (
              <Field>
                <FieldLabel htmlFor="credit-limit">Credit limit</FieldLabel>
                <Input
                  id="credit-limit"
                  inputMode="decimal"
                  autoComplete="off"
                  value={creditLimit}
                  onChange={(event) => setCreditLimit(event.target.value)}
                />
              </Field>
            ) : null}
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
            <div className="switch-row">
              <div>
                <FieldLabel htmlFor="on-budget">On budget</FieldLabel>
                <FieldDescription>You can assign money in this account to buckets.</FieldDescription>
              </div>
              <Switch id="on-budget" checked={onBudget} onCheckedChange={(checked) => setOnBudget(checked === true)} />
            </div>
          </div>
        </Disclosure>
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

function DayField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value === "" ? none : value} onValueChange={(next) => onChange(next === none ? "" : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={none}>Not set</SelectItem>
          {days.map((day) => (
            <SelectItem key={day} value={String(day)}>
              {dayOptionLabel(day)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
