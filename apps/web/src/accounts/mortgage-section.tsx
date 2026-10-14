import { compounding, mortgageFirstPaymentOffPeriod, paymentFrequencies, type Account, type Category } from "@num/shared";
import { ChevronRight } from "lucide-react";
import { useArchiveAccount } from "@/api/accounts";
import { useArchiveCategory } from "@/api/categories";
import { AccountForm } from "@/accounts/account-form";
import { accountLabel } from "@/accounts/label";
import { compoundingLabels, frequencyLabels } from "@/accounts/mortgage-format";
import { draftIsBlank, firstPaymentNotAfterOpening, type MortgageDraft } from "@/accounts/mortgage-draft";
import { DateField } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChoiceSelect } from "@/components/choice-select";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAccounts, useCategories } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { CategoryForm } from "@/settings/category-form";

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

const compoundingOptions = compounding.map((value) => ({ value, label: compoundingLabels[value] }));
const frequencyOptions = paymentFrequencies.map((value) => ({ value, label: frequencyLabels[value] }));

function accountOptions(accounts: Account[]) {
  return accounts.map((account) => ({ id: account.id, label: accountLabel(account) }));
}

function categoryOptions(categories: Category[]) {
  return categories.map((category) => ({ id: category.id, label: category.name }));
}

export function MortgageSection({ accountId, openingDate, draft, onChange, onClear }: SectionProps) {
  const archiveAccount = useArchiveAccount();
  const archiveCategory = useArchiveCategory();
  const accounts = useAccounts();
  const categories = useCategories();
  const change = (patch: Partial<MortgageDraft>) => onChange({ ...draft, ...patch });
  const keep = (id: string) => id === draft.paymentAccountId || id === draft.propertyAccountId;
  const others = accounts.filter((account) => account.id !== accountId);
  const open = others.filter((account) => account.archivedAt === null || keep(account.id));
  const archivedAccounts = others.filter((account) => account.archivedAt !== null);
  const properties = open.filter((account) => account.kind === "property");
  const archivedProperties = archivedAccounts.filter((account) => account.kind === "property");
  const expense = categories.filter((category) => category.kind === "expense");
  const interest = expense.filter((category) => category.archivedAt === null || category.id === draft.interestCategoryId);
  const archivedInterest = expense.filter((category) => category.archivedAt !== null);
  const beforeOpening = firstPaymentNotAfterOpening(openingDate, draft);
  const offPeriod =
    !beforeOpening &&
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
              <ChoiceSelect
                id="mortgage-compounding" className="w-full"
                value={draft.compounding}
                options={compoundingOptions}
                onValueChange={(compounding) => change({ compounding })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="mortgage-payment">Payment</FieldLabel>
              <Input id="mortgage-payment" inputMode="decimal" autoComplete="off" value={draft.payment} onChange={(event) => change({ payment: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mortgage-frequency">How often</FieldLabel>
              <ChoiceSelect
                id="mortgage-frequency" className="w-full"
                value={draft.frequency}
                options={frequencyOptions}
                onValueChange={(frequency) => change({ frequency })}
              />
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
          {beforeOpening ? <FieldError>The first payment must be after the opening date.</FieldError> : null}
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
              onRestore={(id) => archiveAccount.mutate({ id, restore: true }, { onSuccess: (restored) => change({ paymentAccountId: restored.id }) })}
              onChange={(id) => change({ paymentAccountId: id })}
              renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
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
              onRestore={(id) => archiveCategory.mutate({ id, restore: true }, { onSuccess: (restored) => change({ interestCategoryId: restored.id }) })}
              onChange={(id) => change({ interestCategoryId: id })}
              renderForm={(name) => <CategoryForm inline depth={1} category={null} initialName={name} initialKind="expense" />}
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
              onRestore={(id) => archiveAccount.mutate({ id, restore: true }, { onSuccess: (restored) => change({ propertyAccountId: restored.id }) })}
              onChange={(id) => change({ propertyAccountId: id })}
              renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
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
