import { mortgageFirstPaymentOffPeriod, type Account, type Category, type Compounding, type PaymentFrequency } from "@num/shared";
import { ChevronRight } from "lucide-react";
import { accountLabel } from "@/accounts/label";
import { compoundingLabels, frequencyLabels } from "@/accounts/mortgage-format";
import { draftIsBlank, type MortgageDraft } from "@/accounts/mortgage-draft";
import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineAccount, InlineCategory } from "@/editors/inline-records";
import { LoadingLine } from "@/editors/load-state";
import { useAccounts, useCategories } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { useRestoreNamed } from "@/editors/restore-named";

export const mortgageTermsHelp = "Add the terms to see the payment schedule and to split each payment into interest and principal.";
export const openingDateHelp = "Use the date of the last payment before the first payment in Num. Use the amount owed after that payment.";
const firstPaymentWarning =
  "The first payment is not one payment period after the opening date. The first payment gets more or less interest than a regular payment.";

type SectionProps = {
  accountId: string | null;
  openingDate: string;
  draft: MortgageDraft;
  onChange: (draft: MortgageDraft) => void;
  onClear: () => void;
};

function isCompounding(value: string): value is Compounding {
  return value === "monthly" || value === "semiannual";
}

function isFrequency(value: string): value is PaymentFrequency {
  return value === "weekly" || value === "biweekly" || value === "semimonthly" || value === "monthly";
}

function accountOptions(accounts: Account[]) {
  return accounts.map((account) => ({ id: account.id, label: accountLabel(account) }));
}

function categoryOptions(categories: Category[]) {
  return categories.map((category) => ({ id: category.id, label: category.name }));
}

export function MortgageSection({ accountId, openingDate, draft, onChange, onClear }: SectionProps) {
  const restoreNamed = useRestoreNamed();
  const accounts = useAccounts();
  const categories = useCategories();
  if (accounts.isPending || categories.isPending) {
    return <LoadingLine label="Loading the mortgage terms." />;
  }
  if (accounts.isError || categories.isError || !accounts.data || !categories.data) {
    return <p className="text-sm">The mortgage terms did not load.</p>;
  }
  const change = (patch: Partial<MortgageDraft>) => onChange({ ...draft, ...patch });
  const keep = (id: string) => id === draft.paymentAccountId || id === draft.propertyAccountId;
  const others = accounts.data.filter((account) => account.id !== accountId);
  const open = others.filter((account) => account.archivedAt === null || keep(account.id));
  const archivedAccounts = others.filter((account) => account.archivedAt !== null);
  const properties = open.filter((account) => account.kind === "property");
  const archivedProperties = archivedAccounts.filter((account) => account.kind === "property");
  const expense = categories.data.filter((category) => category.kind === "expense");
  const interest = expense.filter((category) => category.archivedAt === null || category.id === draft.interestCategoryId);
  const archivedInterest = expense.filter((category) => category.archivedAt !== null);
  const offPeriod =
    openingDate.length > 0 &&
    draft.firstPaymentDate.length > 0 &&
    mortgageFirstPaymentOffPeriod(openingDate, draft.firstPaymentDate, draft.frequency);

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group flex min-h-11 items-center gap-1.5 font-semibold text-primary">
        <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" strokeWidth={1.8} />
        Mortgage terms
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{mortgageTermsHelp}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="mortgage-rate">Interest rate (%)</FieldLabel>
              <Input id="mortgage-rate" inputMode="decimal" autoComplete="off" value={draft.rate} placeholder="5" onChange={(event) => change({ rate: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mortgage-compounding">Compounded</FieldLabel>
              <Select value={draft.compounding} onValueChange={(value) => { if (isCompounding(value)) change({ compounding: value }); }}>
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
              <Input id="mortgage-payment" inputMode="decimal" autoComplete="off" value={draft.payment} onChange={(event) => change({ payment: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mortgage-frequency">How often</FieldLabel>
              <Select value={draft.frequency} onValueChange={(value) => { if (isFrequency(value)) change({ frequency: value }); }}>
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
              <DateField id="mortgage-first" value={draft.firstPaymentDate} onChange={(value) => change({ firstPaymentDate: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mortgage-term-end">Term ends</FieldLabel>
              <DateField id="mortgage-term-end" value={draft.termEnd} onChange={(value) => change({ termEnd: value })} />
            </Field>
          </div>
          {offPeriod ? <p className="text-sm" role="status">{firstPaymentWarning}</p> : null}
          <Field>
            <FieldLabel htmlFor="mortgage-months">Months left on the amortization</FieldLabel>
            <Input id="mortgage-months" inputMode="numeric" autoComplete="off" value={draft.months} onChange={(event) => change({ months: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-pay-from">Pay from</FieldLabel>
            <ManagedPicker
              id="mortgage-pay-from"
              value={draft.paymentAccountId}
              options={accountOptions(open)}
              placeholder="Choose an account"
              noun="account"
              archived={accountOptions(archivedAccounts)}
              onRestore={(id) => {
                void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
                  if (restored) change({ paymentAccountId: restored });
                });
              }}
              onChange={(id) => change({ paymentAccountId: id })}
              renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-interest">Interest category</FieldLabel>
            <ManagedPicker
              id="mortgage-interest"
              value={draft.interestCategoryId}
              options={categoryOptions(interest)}
              placeholder="Choose a category"
              noun="category"
              archived={categoryOptions(archivedInterest)}
              onRestore={(id) => {
                void restoreNamed(`/api/categories/${id}/restore`).then((restored) => {
                  if (restored) change({ interestCategoryId: restored });
                });
              }}
              onChange={(id) => change({ interestCategoryId: id })}
              renderForm={(name, finish) => <InlineCategory name={name} kind="expense" depth={1} onDone={finish} />}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-property">Property</FieldLabel>
            <ManagedPicker
              id="mortgage-property"
              value={draft.propertyAccountId}
              options={accountOptions(properties)}
              placeholder="No property"
              emptyLabel="No property"
              noun="account"
              archived={accountOptions(archivedProperties)}
              onRestore={(id) => {
                void restoreNamed(`/api/accounts/${id}/restore`).then((restored) => {
                  if (restored) change({ propertyAccountId: restored });
                });
              }}
              onChange={(id) => change({ propertyAccountId: id })}
              renderForm={(name, finish) => <InlineAccount name={name} onDone={finish} />}
            />
          </Field>
          {draftIsBlank(draft) ? null : (
            <Button type="button" variant="outline" className="justify-self-start" onClick={onClear}>
              Remove the mortgage terms
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
