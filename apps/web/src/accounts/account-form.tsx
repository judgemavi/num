import {
  accountClass,
  accountCreateSchema,
  accountKinds,
  accountSchema,
  accountUpdateSchema,
  allowsInterestRate,
  defaultOnBudget,
  toMinorUnits,
  Temporal,
  type Account,
  type AccountKind,
  type PaymentPolicy,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { accountError, bpsToPercent, fromMinorUnits, kindLabel, percentToBps, policyLabel } from "@/accounts/format";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AccountFormProps = {
  currency: string;
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
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
  const [openingDate, setOpeningDate] = useState(
    account?.openingDate ?? Temporal.Now.plainDateISO().toString(),
  );
  const [openingBalance, setOpeningBalance] = useState(
    account ? fromMinorUnits(currency, account.openingBalance) : "",
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit === null || account?.creditLimit === undefined
      ? ""
      : fromMinorUnits(currency, account.creditLimit),
  );
  const [statementDay, setStatementDay] = useState(
    account?.statementDay === null || account?.statementDay === undefined ? "" : String(account.statementDay),
  );
  const [dueDay, setDueDay] = useState(
    account?.dueDay === null || account?.dueDay === undefined ? "" : String(account.dueDay),
  );
  const [paymentPolicy, setPaymentPolicy] = useState<PaymentPolicy | null>(account?.paymentPolicy ?? null);
  const [fixedPayment, setFixedPayment] = useState(
    account?.fixedPayment === null || account?.fixedPayment === undefined
      ? ""
      : fromMinorUnits(currency, account.fixedPayment),
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRateBps === null || account?.interestRateBps === undefined
      ? ""
      : bpsToPercent(account.interestRateBps),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kinds = account
    ? accountKinds.filter((item) => accountClass(item) === accountClass(account.kind))
    : accountKinds;

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
              fixedPayment:
                paymentPolicy === "fixed" ? readAmount(currency, fixedPayment, "the fixed payment") : null,
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
        openingBalance: readAmount(currency, openingBalance, "the opening balance"),
        interestRateBps: allowsInterestRate(kind) ? percentToBps(interestRate) : null,
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
        <DialogDescription>
          {account ? "Change the details of this account." : "Add an account to the book."}
        </DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <Field>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input id="account-name" value={name} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-institution">Institution</FieldLabel>
          <Input
            id="account-institution"
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-kind">Kind</FieldLabel>
          <Select value={kind} onValueChange={changeKind}>
            <SelectTrigger id="account-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((item) => (
                <SelectItem key={item} value={item}>
                  {kindLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="on-budget"
            checked={onBudget}
            onCheckedChange={(checked) => setOnBudget(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="on-budget">On budget</FieldLabel>
            <FieldDescription>You can assign money in this account to buckets.</FieldDescription>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="opening-date">Opening date</FieldLabel>
          <Input
            id="opening-date"
            type="date"
            value={openingDate}
            required
            onChange={(event) => setOpeningDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="opening-balance">Opening balance</FieldLabel>
          <Input
            id="opening-balance"
            inputMode="decimal"
            autoComplete="off"
            value={openingBalance}
            required
            onChange={(event) => setOpeningBalance(event.target.value)}
          />
        </Field>
        {allowsInterestRate(kind) ? (
          <Field>
            <FieldLabel htmlFor="interest-rate">Interest rate (%)</FieldLabel>
            <Input
              id="interest-rate"
              inputMode="decimal"
              autoComplete="off"
              value={interestRate}
              placeholder="5.25"
              onChange={(event) => setInterestRate(event.target.value)}
            />
          </Field>
        ) : null}
        {kind === "credit_card" ? (
          <>
            <Field>
              <FieldLabel htmlFor="payment-policy">Card payment</FieldLabel>
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
            <Field>
              <FieldLabel htmlFor="statement-day">Statement day</FieldLabel>
              <Input
                id="statement-day"
                inputMode="numeric"
                value={statementDay}
                onChange={(event) => setStatementDay(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="due-day">Due day</FieldLabel>
              <Input
                id="due-day"
                inputMode="numeric"
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
              />
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
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving account" : "Save account"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
