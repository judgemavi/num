import {
  fromMinorUnits,
  milliPctToPercent,
  mortgageTermsSchema,
  mortgageTermsWriteSchema,
  percentToMilliPct,
  toMinorUnits,
  type Account,
  type Category,
  type Compounding,
  type MortgageTerms,
  type PaymentFrequency,
} from "@num/shared";
import { useState, type FormEvent } from "react";
import { compoundingLabels, frequencyLabels, mortgageError } from "@/accounts/mortgage-format";
import { useRestoreNamed } from "@/editors/restore-named";
import { InlineAccount, InlineCategory } from "@/editors/inline-records";
import { ManagedPicker } from "@/editors/managed-picker";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MortgageFormProps = {
  accountId: string;
  currency: string;
  terms: MortgageTerms | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

function readMoney(currency: string, text: string, label: string): number {
  try {
    const minor = toMinorUnits(currency, text.trim());
    if (minor < 0) {
      throw new Error(`Enter ${label} as a positive amount.`);
    }
    return minor;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Enter ")) {
      throw error;
    }
    throw new Error(`Enter ${label} as a number.`);
  }
}

function readRate(text: string): number {
  try {
    return percentToMilliPct(text);
  } catch {
    throw new Error("Enter the interest rate as a percent with up to 3 decimal places.");
  }
}

function readMonths(text: string): number {
  if (!/^\d+$/.test(text.trim())) {
    throw new Error("Enter the months left as a whole number.");
  }
  return Number(text.trim());
}

function isCompounding(value: string): value is Compounding {
  return value === "monthly" || value === "semiannual";
}

function isFrequency(value: string): value is PaymentFrequency {
  return value === "weekly" || value === "biweekly" || value === "semimonthly" || value === "monthly";
}

export function MortgageForm({ accountId, currency, terms, accounts, categories, onClose, onSaved }: MortgageFormProps) {
  const restoreNamed = useRestoreNamed();
  const [principal, setPrincipal] = useState(terms ? fromMinorUnits(currency, terms.principal) : "");
  const [principalAsOf, setPrincipalAsOf] = useState(terms?.principalAsOf ?? "");
  const [rate, setRate] = useState(terms ? milliPctToPercent(terms.rateMilliPct) : "");
  const [compound, setCompound] = useState<Compounding>(terms?.compounding ?? "semiannual");
  const [payment, setPayment] = useState(terms ? fromMinorUnits(currency, terms.paymentAmount) : "");
  const [frequency, setFrequency] = useState<PaymentFrequency>(terms?.paymentFrequency ?? "monthly");
  const [firstPaymentDate, setFirstPaymentDate] = useState(terms?.firstPaymentDate ?? "");
  const [termEnd, setTermEnd] = useState(terms?.termEnd ?? "");
  const [months, setMonths] = useState(terms ? String(terms.amortizationMonthsRemaining) : "");
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(terms?.paymentAccountId ?? null);
  const [interestCategoryId, setInterestCategoryId] = useState<string | null>(terms?.interestCategoryId ?? null);
  const [propertyAccountId, setPropertyAccountId] = useState<string | null>(terms?.propertyAccountId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAccounts = accounts.filter((account) => account.archivedAt === null || account.id === paymentAccountId || account.id === propertyAccountId);
  const paymentOptions = openAccounts
    .filter((account) => account.id !== accountId)
    .map((account) => ({ id: account.id, label: account.name }));
  const propertyOptions = openAccounts
    .filter((account) => account.kind === "property")
    .map((account) => ({ id: account.id, label: account.name }));
  const interestOptions = categories
    .filter((category) => category.kind === "expense" && (category.archivedAt === null || category.id === interestCategoryId))
    .map((category) => ({ id: category.id, label: category.name }));
  const archivedAccounts = accounts
    .filter((account) => account.archivedAt !== null && account.id !== accountId)
    .map((account) => ({ id: account.id, label: account.name }));
  const archivedProperties = accounts
    .filter((account) => account.archivedAt !== null && account.kind === "property")
    .map((account) => ({ id: account.id, label: account.name }));
  const archivedInterest = categories
    .filter((category) => category.archivedAt !== null && category.kind === "expense")
    .map((category) => ({ id: category.id, label: category.name }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!paymentAccountId || !interestCategoryId) {
      setError("Choose the payment account and the interest category.");
      return;
    }
    let body: unknown;
    try {
      body = {
        principal: readMoney(currency, principal, "the amount owed"),
        principalAsOf,
        rateMilliPct: readRate(rate),
        compounding: compound,
        paymentAmount: readMoney(currency, payment, "the payment"),
        paymentFrequency: frequency,
        firstPaymentDate,
        termEnd,
        amortizationMonthsRemaining: readMonths(months),
        paymentAccountId,
        interestCategoryId,
        propertyAccountId,
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the mortgage terms.");
      return;
    }
    const parsed = mortgageTermsWriteSchema.safeParse(body);
    if (!parsed.success) {
      setError("Check the mortgage terms.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest(`/api/accounts/${accountId}/mortgage-terms`, mortgageTermsSchema, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!result.ok) {
        setError(mortgageError(result.code));
        return;
      }
      onSaved(accountId);
    } catch {
      setError("The mortgage terms did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mortgage terms</DialogTitle>
        <DialogDescription>These terms calculate the schedule. They do not create payments.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-principal">Amount owed</FieldLabel>
            <Input id="mortgage-principal" inputMode="decimal" autoComplete="off" value={principal} required onChange={(event) => setPrincipal(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-principal-date">On this date</FieldLabel>
            <Input id="mortgage-principal-date" type="date" value={principalAsOf} required onChange={(event) => setPrincipalAsOf(event.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-rate">Interest rate (%)</FieldLabel>
            <Input id="mortgage-rate" inputMode="decimal" autoComplete="off" value={rate} placeholder="5" required onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-compounding">Compounded</FieldLabel>
            <Select value={compound} onValueChange={(value) => { if (isCompounding(value)) setCompound(value); }}>
              <SelectTrigger id="mortgage-compounding" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(compoundingLabels) as Compounding[]).map((item) => (
                  <SelectItem key={item} value={item}>{compoundingLabels[item]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-payment">Payment</FieldLabel>
            <Input id="mortgage-payment" inputMode="decimal" autoComplete="off" value={payment} required onChange={(event) => setPayment(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-frequency">How often</FieldLabel>
            <Select value={frequency} onValueChange={(value) => { if (isFrequency(value)) setFrequency(value); }}>
              <SelectTrigger id="mortgage-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(frequencyLabels) as PaymentFrequency[]).map((item) => (
                  <SelectItem key={item} value={item}>{frequencyLabels[item]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-first">First payment</FieldLabel>
            <Input id="mortgage-first" type="date" value={firstPaymentDate} required onChange={(event) => setFirstPaymentDate(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-term-end">Term ends</FieldLabel>
            <Input id="mortgage-term-end" type="date" value={termEnd} required onChange={(event) => setTermEnd(event.target.value)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="mortgage-months">Months left on the amortization</FieldLabel>
          <Input id="mortgage-months" inputMode="numeric" autoComplete="off" value={months} required onChange={(event) => setMonths(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="mortgage-pay-from">Pay from</FieldLabel>
          <ManagedPicker
            id="mortgage-pay-from"
            value={paymentAccountId}
            options={paymentOptions}
            placeholder="Choose an account"
            noun="account"
            archived={archivedAccounts}
            onRestore={(id) => {
              void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
                if (restored) setPaymentAccountId(restored);
              });
            }}
            onChange={setPaymentAccountId}
            renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="mortgage-interest">Interest category</FieldLabel>
          <ManagedPicker
            id="mortgage-interest"
            value={interestCategoryId}
            options={interestOptions}
            placeholder="Choose a category"
            noun="category"
            archived={archivedInterest}
            onRestore={(id) => {
              void restoreNamed(`/api/categories/${id}/restore`).then((restored) => {
                if (restored) setInterestCategoryId(restored);
              });
            }}
            onChange={setInterestCategoryId}
            renderForm={(name, finish) => <InlineCategory name={name} kind="expense" depth={1} onDone={finish} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="mortgage-property">Property</FieldLabel>
          <ManagedPicker
            id="mortgage-property"
            value={propertyAccountId}
            options={propertyOptions}
            placeholder="No property"
            emptyLabel="No property"
            noun="account"
            archived={archivedProperties}
            onRestore={(id) => {
              void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
                if (restored) setPropertyAccountId(restored);
              });
            }}
            onChange={setPropertyAccountId}
            renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
          />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving terms" : "Save terms"}</Button>
        </DialogFooter>
      </form>
    </>
  );
}
