import type { Bucket } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { AccountForm } from "@/accounts/account-form";
import { accountLabel } from "@/accounts/label";
import { useCreateBucket, useUpdateBucket } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/buckets/bucket-pickers";
import { requestError } from "@/buckets/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { useEditorFrame } from "@/editors/editor-api";
import { DialogBody } from "@/editors/form-chrome";
import { useAccounts, useActiveBuckets, useBookCurrency, useCategories, useMerchants } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { useAppForm } from "@/forms/form-hook";
import { scheduleBody, scheduleValues, type ScheduleSeed } from "@/schedules/schedule-values";
import { CategoryForm } from "@/settings/category-form";
import { MerchantForm } from "@/settings/merchant-form";

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

const words = {
  commitment: {
    add: "New bill",
    edit: "Edit bill",
    hint: "Enter the amount you pay each time.",
  },
  income: {
    add: "New income",
    edit: "Edit income",
    hint: "Enter the amount you receive each time.",
  },
} as const;

/** The form of a bill (a commitment) or an income: a bucket with a schedule. The UI calls a commitment a bill. */
export function ScheduleForm({ kind, draft }: { kind: "commitment" | "income"; draft: Bucket | ScheduleSeed | "new" }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const board = useActiveBuckets();
  const current = draft !== "new" && "id" in draft ? draft : null;
  const create = useCreateBucket();
  const update = useUpdateBucket();
  const form = useAppForm({
    defaultValues: scheduleValues(kind, draft, board.nextColor),
    validators: {
      onSubmit: ({ value }) => scheduleBody(currency, kind, value, current).error ?? undefined,
    },
    onSubmit: async ({ value, formApi }) => {
      const { body, patch } = scheduleBody(currency, kind, value, current);
      if (!body) {
        return;
      }
      // An edit with no change closes without a write.
      if (current && !patch) {
        close();
        return;
      }
      try {
        const saved =
          current && patch ? await update.mutateAsync({ id: current.id, body: patch }) : await create.mutateAsync({ asOf: localAsOf(), body });
        close(saved.id);
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "This did not save. Try again."), fields: {} } });
      }
    },
  });
  const freq = useStore(form.store, (state) => state.values.freq);
  const color = useStore(form.store, (state) => state.values.color);
  const accountId = useStore(form.store, (state) => state.values.accountId);
  const merchantId = useStore(form.store, (state) => state.values.merchantId);
  const transferAccountId = useStore(form.store, (state) => state.values.transferAccountId);

  const accountOptions = accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }));
  const categoryOptions = categories
    .filter((item) => !item.archivedAt && item.kind === (kind === "income" ? "income" : "expense"))
    .map((item) => ({ id: item.id, label: item.name }));
  const text = words[kind];

  return (
    <form.AppForm>
      <DialogHeader>
        <DialogTitle>{current ? text.edit : text.add}</DialogTitle>
      </DialogHeader>
      <form.FormShell>
        <DialogBody>
          <form.AppField name="name">{(field) => <field.TextField id="schedule-name" label="Name" required />}</form.AppField>
          <form.Field name="accountId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="schedule-account">Account</FieldLabel>
                <ManagedPicker
                  id="schedule-account"
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
          {kind === "commitment" ? (
            <form.Field name="transferAccountId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="schedule-transfer">Paid to your account</FieldLabel>
                  <ManagedPicker
                    id="schedule-transfer"
                    value={field.state.value}
                    options={accountOptions.filter((item) => item.id !== accountId)}
                    placeholder="No, paid to someone else"
                    emptyLabel="No, paid to someone else"
                    noun="account"
                    onChange={field.handleChange}
                    renderForm={(name) => <AccountForm inline account={null} initialName={name} />}
                  />
                </Field>
              )}
            </form.Field>
          ) : null}
          <form.AppField name="amount">{(field) => <field.MoneyField id="schedule-amount" label="Amount" required description={text.hint} />}</form.AppField>
          <form.AppField name="amountMode">{(field) => <field.SelectField id="schedule-mode" label="Amount changes" options={amountModeOptions} />}</form.AppField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="startDate">{(field) => <field.DateInputField id="schedule-start" label="Starts" required />}</form.AppField>
            <form.AppField name="interval">
              {(field) => <field.TextField id="schedule-every" label="Every" inputMode="numeric" required description="2 with weekly means every two weeks." />}
            </form.AppField>
          </div>
          <form.AppField name="freq">{(field) => <field.SelectField id="schedule-freq" label="Repeats" options={freqOptions} />}</form.AppField>
          {freq === "weekly" ? null : (
            <form.AppField name="monthDay">{(field) => <field.SelectField id="schedule-day" label="Day of the month" options={monthDayOptions} />}</form.AppField>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form.AppField name="shift">{(field) => <field.SelectField id="schedule-shift" label="Weekend" options={shiftOptions} />}</form.AppField>
            <form.AppField name="endDate">{(field) => <field.DateInputField id="schedule-end" label="Ends" />}</form.AppField>
          </div>
          <form.AppField name="tolerance">
            {(field) => <field.MoneyField id="schedule-tolerance" label="Match within" description="How far the amount can be and still match." />}
          </form.AppField>
          {transferAccountId === null ? (
            <form.Field name="categoryId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="schedule-category">Category</FieldLabel>
                  <ManagedPicker
                    id="schedule-category"
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
          ) : null}
          <form.Field name="merchantId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="schedule-merchant">Merchant</FieldLabel>
                <ManagedPicker
                  id="schedule-merchant"
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
          {kind === "commitment" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <form.AppField name="bucketStart">
                  {(field) => (
                    <field.DateInputField
                      id="schedule-bucket-start"
                      label="Count payments from"
                      required
                      description="The bucket funds payments from the month of this date. Earlier payments do not count."
                    />
                  )}
                </form.AppField>
                <form.AppField name="priority">
                  {(field) => <field.TextField id="schedule-priority" label="Priority" inputMode="numeric" required description="Lower numbers are funded first." />}
                </form.AppField>
              </div>
              <form.AppField name="essential">{(field) => <field.SwitchField id="schedule-essential" label="Essential" />}</form.AppField>
            </>
          ) : null}
          <form.Field name="color">{(field) => <ColorPicker value={field.state.value} onChange={field.handleChange} suggest={current === null} />}</form.Field>
          <form.Field name="icon">{(field) => <IconPicker value={field.state.value} color={color} onChange={field.handleChange} />}</form.Field>
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
