import { accountClass, accountKinds, allowsInterestRate, defaultOnBudget, paymentPolicies, type Account, type MortgageTerms } from "@num/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { accountBody, accountValues, automaticOpeningDate, blankAccount } from "@/accounts/account-values";
import { accountError, policyLabel } from "@/accounts/format";
import { sameClassKinds } from "@/accounts/groups";
import { KindPicker } from "@/accounts/kind-picker";
import { draftIsBlank } from "@/accounts/mortgage-draft";
import { MortgageSection, openingDateHelp } from "@/accounts/mortgage-section";
import { useSaveAccount } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { Boundary } from "@/components/boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DateField } from "@/components/date-field";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody, FormActions, FormCancel, FormHeading } from "@/editors/form-chrome";
import { useBookCurrency } from "@/editors/lookups";
import { useAppForm, withForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { useStore } from "@tanstack/react-form";

type AccountFormProps = {
  initialName?: string;
  account: Account | null;
  /** The saved terms of a mortgage account. Null when the account has none. */
  terms?: MortgageTerms | null;
  inline?: boolean;
  below?: ReactNode;
};

const policyOptions = paymentPolicies.map((value) => ({ value, label: policyLabel(value) }));

/** A change that the form makes after another change. It does not start the listeners of the field. */
const follow = { dontRunListeners: true };

export function AccountForm({ account, terms = null, initialName, inline = false, below }: AccountFormProps) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const save = useSaveAccount();
  const allowed = account ? sameClassKinds(account.kind) : accountKinds;
  const stored = account ? { account, terms } : null;

  const form = useAppForm({
    defaultValues: accountValues(account, terms, initialName ?? ""),
    validators: {
      onSubmit: ({ value }) => accountBody(currency, value, value.kind === "mortgage" && !inline, stored).error ?? undefined,
    },
    onSubmit: async ({ value, formApi }) => {
      const { body, patch } = accountBody(currency, value, value.kind === "mortgage" && !inline, stored);
      if (!body) {
        return;
      }
      const request = account ? (patch ? { id: account.id, body: patch } : null) : { id: null, body };
      // An edit with no change closes without a write.
      if (!request) {
        close();
        return;
      }
      try {
        const saved = await save.mutateAsync(request);
        close(saved.id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: accountError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <FormHeading
        inline={inline}
        title={account ? "Edit account" : "Add an account"}
        description={account ? "Change the details of this account." : "Add an account to the book."}
      />
      <form.FormShell inline={inline} className={inline ? "grid gap-4" : undefined}>
        <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
          <form.AppField name="name">{(field) => <field.TextField id="account-name" label="Name" required />}</form.AppField>
          <form.AppField name="institution">{(field) => <field.TextField id="account-institution" label="Institution" />}</form.AppField>
          <form.Field
            name="kind"
            listeners={{
              // A new kind starts with its own budget choice. The card and interest fields stay only for kinds that have them.
              onChange: ({ value, fieldApi }) => {
                fieldApi.form.setFieldValue("onBudget", defaultOnBudget(value), follow);
                if (value !== "credit_card") {
                  fieldApi.form.setFieldValue("paymentPolicy", null, follow);
                  fieldApi.form.setFieldValue("fixedPayment", "", follow);
                }
                if (!allowsInterestRate(value)) {
                  fieldApi.form.setFieldValue("interestRate", "", follow);
                }
              },
            }}
          >
            {(field) => <KindPicker kind={field.state.value} allowed={allowed} onChange={field.handleChange} />}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.kind}>
            {(kind) => (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <form.AppField name="openingBalance">
                    {(field) => <field.MoneyField id="opening-balance" label={accountClass(kind) === "liability" ? "Amount owed" : "Balance"} />}
                  </form.AppField>
                  <OpeningDate form={form} account={account} termsShown={kind === "mortgage" && !inline} />
                </div>
                <p className="text-sm text-muted-foreground" style={{ marginTop: 0 }}>
                  Leave the balance blank to start at 0. Num counts forward from this date.
                </p>
                {kind === "mortgage" && !inline ? (
                  <Boundary look="panel" loading="Loading the mortgage terms." failed="The mortgage terms did not load.">
                    <MortgageSection form={form} accountId={account?.id ?? null} />
                  </Boundary>
                ) : null}
                {kind === "credit_card" ? <CardFields form={form} /> : null}
                <Collapsible>
                  <CollapsibleTrigger className="group flex min-h-11 items-center gap-1.5 font-semibold text-primary">
                    <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" strokeWidth={1.8} />
                    More details
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-4">
                      {allowsInterestRate(kind) ? (
                        <form.AppField name="interestRate">
                          {(field) => <field.TextField inputMode="decimal" id="interest-rate" label="Interest rate (%)" placeholder="6.875" />}
                        </form.AppField>
                      ) : null}
                      <form.Field name="onBudget">
                        {(field) => (
                          <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                            <FieldLabel htmlFor="on-budget">Use this account's money in my budget</FieldLabel>
                            <Switch id="on-budget" checked={field.state.value} onCheckedChange={field.handleChange} />
                          </div>
                        )}
                      </form.Field>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </form.Subscribe>
          <form.FormError invalid="Check the account fields." />
          {below}
        </DialogBody>
        <FormActions inline={inline}>
          <FormCancel>Cancel</FormCancel>
          <form.SubmitButton inline={inline} saving="Saving account">
            {account ? "Save account" : "Add account"}
          </form.SubmitButton>
        </FormActions>
      </form.FormShell>
    </form.AppForm>
  );
}

/** The opening date. It is automatic until the person chooses a date. */
const OpeningDate = withForm({
  defaultValues: blankAccount,
  props: { account: fieldValue<Account | null>(null), termsShown: false },
  render: function OpeningDateRender({ form, account, termsShown }) {
    const automatic = useStore(form.store, (state) => state.values.automatic);
    const termsOn = useStore(form.store, (state) => termsShown && !draftIsBlank(state.values.mortgage));
    return (
      <form.Field
        name="openingDate"
        listeners={{
          onChange: ({ fieldApi }) => fieldApi.form.setFieldValue("automatic", false),
        }}
      >
        {(field) => (
          <Field>
            <FieldLabel htmlFor="opening-date">On this date</FieldLabel>
            <DateField id="opening-date" value={field.state.value} onChange={field.handleChange} />
            {termsOn ? (
              <FieldDescription>{openingDateHelp}</FieldDescription>
            ) : automatic ? (
              <FieldDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">Automatic</Badge>
                {account?.automaticFollowsTransactions ? "This date follows the first transaction." : "Num uses today until you add transactions."}
              </FieldDescription>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-11 min-h-11 justify-start px-0"
                onClick={() => {
                  form.setFieldValue("automatic", true);
                  form.setFieldValue("openingDate", automaticOpeningDate(account), follow);
                }}
              >
                Use automatic date
              </Button>
            )}
          </Field>
        )}
      </form.Field>
    );
  },
});

/** How the person pays a credit card, and the fixed payment. */
const CardFields = withForm({
  defaultValues: blankAccount,
  render: function CardFieldsRender({ form }) {
    const policy = useStore(form.store, (state) => state.values.paymentPolicy);
    return (
      <>
        <form.AppField
          name="paymentPolicy"
          listeners={{
            onChange: ({ value, fieldApi }) => {
              if (value !== "fixed") {
                fieldApi.form.setFieldValue("fixedPayment", "", follow);
              }
            },
          }}
        >
          {(field) => <field.SelectField id="payment-policy" label="How you pay" options={policyOptions} placeholder="Choose how you pay" />}
        </form.AppField>
        {policy === "fixed" ? (
          <form.AppField name="fixedPayment">{(field) => <field.MoneyField id="fixed-payment" label="Fixed payment" required />}</form.AppField>
        ) : null}
      </>
    );
  },
});
