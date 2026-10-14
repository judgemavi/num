import { planKinds, type Plan, type PlanKind } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { kindLabel, planError, recurringTitle } from "@/recurring/format";
import { planBody, planValues, type PlanSeed } from "@/recurring/plan-values";
import { useEditorFrame } from "@/editors/editor-api";
import { useAccounts, useBookCurrency, useCategories, useMerchants } from "@/editors/lookups";
import { AccountForm } from "@/accounts/account-form";
import { CategoryForm } from "@/settings/category-form";
import { MerchantForm } from "@/settings/merchant-form";
import { ManagedPicker } from "@/editors/managed-picker";
import { errorCode } from "@/api/client";
import { useSavePlan } from "@/api/recurring";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { accountLabel } from "@/accounts/label";
import { Field, FieldLabel } from "@/components/ui/field";

const kindOptions = planKinds.map((kind) => ({ value: kind, label: kindLabel(kind) }));

const amountModeOptions = [
  { value: "fixed", label: "Same amount each time" },
  { value: "variable", label: "Amount changes each time" },
] as const;

const freqOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

const monthDayOptions = [
  { value: "same", label: "Same day as the start date" },
  { value: "last", label: "Last day of the month" },
  ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })),
];

const shiftOptions = [
  { value: "none", label: "Keep the date" },
  { value: "next", label: "Move to the next weekday" },
  { value: "previous", label: "Move to the previous weekday" },
] as const;

export function PlanForm({ draft, initialKind = "bill" }: { draft: Plan | PlanSeed | "new"; initialKind?: PlanKind }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const current = draft !== "new" && "id" in draft ? draft : null;
  const save = useSavePlan();
  const [more, setMore] = useState(Boolean(current?.merchantId || current?.categoryId || current?.endDate));
  const form = useAppForm({
    defaultValues: planValues(draft, initialKind),
    validators: {
      onSubmit: ({ value }) => planBody(currency, value, current).error ?? undefined,
    },
    onSubmit: async ({ value, formApi }) => {
      const { body, patch } = planBody(currency, value, current);
      if (!body) {
        return;
      }
      const request = current ? (patch ? { id: current.id, body: patch } : null) : { id: null, body };
      // An edit with no change closes without a write.
      if (!request) {
        close();
        return;
      }
      try {
        close((await save.mutateAsync(request)).id);
      } catch (error) {
        const code = errorCode(error);
        formApi.setErrorMap({ onSubmit: { form: code ? planError(code) : "This did not save. Try again.", fields: {} } });
      }
    },
  });
  const kind = useStore(form.store, (state) => state.values.kind);
  const freq = useStore(form.store, (state) => state.values.freq);
  const accountId = useStore(form.store, (state) => state.values.accountId);
  const merchantId = useStore(form.store, (state) => state.values.merchantId);

  const accountOptions = accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }));
  const categoryOptions = categories
    .filter((item) => !item.archivedAt && item.kind === (kind === "income" ? "income" : "expense"))
    .map((item) => ({ id: item.id, label: item.name }));

  return (
    <form.AppForm>
      <DialogHeader>
        <DialogTitle>{recurringTitle(kind, current !== null)}</DialogTitle>
        <DialogDescription>{current ? "Change what you expect and when." : "Add a payment or deposit you expect on a schedule."}</DialogDescription>
      </DialogHeader>
      <form.FormShell>
        <DialogBody>
          <form.AppField name="name">{(field) => <field.TextField id="plan-name" label="Name" required />}</form.AppField>
          <form.AppField name="kind">{(field) => <field.SelectField id="plan-kind-field" label="Kind" options={kindOptions} />}</form.AppField>
          <form.Field name="accountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="plan-account-field">Account</FieldLabel>
                <ManagedPicker
                  id="plan-account-field"
                  value={field.state.value}
                  options={accountOptions}
                  placeholder="Choose an account"
                  noun="account"
                  archived={accounts.filter((item) => item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }))}
                  onChange={field.handleChange}
                  renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
                />
              </Field>
            )}
          </form.Field>
          {kind === "transfer" ? (
            <form.Field name="transferAccountId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="plan-transfer">Other account</FieldLabel>
                  <ManagedPicker
                    id="plan-transfer"
                    value={field.state.value}
                    options={accountOptions.filter((item) => item.id !== accountId)}
                    placeholder="Choose an account"
                    noun="account"
                    onChange={field.handleChange}
                    renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
                  />
                </Field>
              )}
            </form.Field>
          ) : null}
          <form.AppField name="amount">
            {(field) => (
              <field.MoneyField
                id="plan-amount"
                label="Amount"
               
                required
                description={kind === "transfer" ? "Use a minus sign when money leaves this account." : "Enter the amount you expect."}
              />
            )}
          </form.AppField>
          <form.AppField name="amountMode">{(field) => <field.SelectField id="plan-mode" label="Amount changes" options={amountModeOptions} />}</form.AppField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="startDate">{(field) => <field.DateInputField id="plan-start" label="Starts" required />}</form.AppField>
            <form.AppField name="interval">
              {(field) => <field.TextField id="plan-every" label="Every" inputMode="numeric" required description="2 with weekly means every two weeks." />}
            </form.AppField>
          </div>
          <form.AppField name="freq">{(field) => <field.SelectField id="plan-freq" label="Repeats" options={freqOptions} />}</form.AppField>
          {freq === "weekly" ? null : (
            <form.AppField name="monthDay">{(field) => <field.SelectField id="plan-day" label="Day of the month" options={monthDayOptions} />}</form.AppField>
          )}
          <form.AppField name="active">{(field) => <field.SwitchField id="plan-active" label="Active" />}</form.AppField>
          <Collapsible open={more} onOpenChange={setMore}>
            <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
              <ChevronRight className={`size-4 transition-transform ${more ? "rotate-90" : ""}`} aria-hidden="true" />
              More options: merchant, category, end date
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-3">
              {kind === "transfer" ? null : (
                <form.Field name="categoryId">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="plan-category">Category</FieldLabel>
                      <ManagedPicker
                        id="plan-category"
                        value={field.state.value}
                        options={categoryOptions}
                        placeholder="No category"
                        emptyLabel="No category"
                        noun="category"
                        onChange={field.handleChange}
                        renderForm={(name) => (
                          <CategoryForm inline depth={1} category={null} initialName={name} initialKind={kind === "income" ? "income" : "expense"} />
                        )}
                      />
                    </Field>
                  )}
                </form.Field>
              )}
              <form.Field name="merchantId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="plan-merchant">Merchant</FieldLabel>
                    <ManagedPicker
                      id="plan-merchant"
                      value={field.state.value}
                      options={merchants.filter((item) => item.archivedAt === null || item.id === merchantId).map((item) => ({ id: item.id, label: item.name }))}
                      placeholder="Any merchant"
                      emptyLabel="Any merchant"
                      noun="merchant"
                      archived={merchants.filter((item) => item.archivedAt).map((item) => ({ id: item.id, label: item.name }))}
                      onChange={field.handleChange}
                      renderForm={(name) => <MerchantForm inline depth={1} merchant={null} initialName={name} />}
                    />
                  </Field>
                )}
              </form.Field>
              <form.AppField name="tolerance">
                {(field) => <field.MoneyField id="plan-tolerance" label="Match within" description="How far the amount can be and still match." />}
              </form.AppField>
              <form.AppField name="shift">{(field) => <field.SelectField id="plan-shift" label="Weekend" options={shiftOptions} />}</form.AppField>
              <form.AppField name="endDate">{(field) => <field.DateInputField id="plan-end" label="Ends" />}</form.AppField>
              {kind === "income" ? <form.AppField name="fundsBuckets">{(field) => <field.SwitchField id="plan-funds" label="This paycheck funds buckets" />}</form.AppField> : null}
            </CollapsibleContent>
          </Collapsible>
          <form.FormError invalid="Check the details and try again." />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.SubmitButton saving="Saving">{current ? "Save" : "Add"}</form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
