import { moneyDirection, type BulkEdit, type Transaction } from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-form";
import { errorCode } from "@/api/client";
import { transactionQuery, useBulkEdit } from "@/api/transactions";
import { Amount } from "@/components/amount";
import { ListRow } from "@/components/list-card";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, FormCancel } from "@/editors/form-chrome";
import { useAccountLabels } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";
import { BulkMerchantField, BulkTagFields, BulkWhatField } from "@/transactions/bulk-fields";
import { bulkChoices, bulkValues } from "@/transactions/bulk-values";
import { formatDate, transactionError } from "@/transactions/format";
import { useTargetText } from "@/transactions/names";

/** The bulk editor of the selected rows (decision 0051). It reads each row by its id. */
export function BulkEditor({ ids }: EditorInput["bulkEdit"]) {
  const rows = useSuspenseQueries({ queries: ids.map((id) => transactionQuery(id)) }).map((result) => result.data);
  return <BulkForm rows={rows} />;
}

/** The choices of "What is this?" for the rows. Money out and money in together leave only Transfer. */
function choicesFor(rows: Transaction[], accountId: string | null) {
  const out = rows.some((row) => moneyDirection(row.amount) === "out");
  const into = rows.some((row) => moneyDirection(row.amount) === "in");
  return bulkChoices.filter((choice) => {
    if (choice === "none") {
      return true;
    }
    if (choice === "transfer") {
      return accountId !== null;
    }
    const direction = choice === "spending" ? "out" : "in";
    return out !== into && (direction === "out" ? out : into);
  });
}

/** The request of the bulk edit: only the fields that the person changed. */
function bulkBody(ids: string[], accountId: string | null, value: typeof bulkValues): BulkEdit {
  const transfer = value.what === "transfer" && accountId && value.transferAccountId ? { kind: "transfer" as const, accountId, transferAccountId: value.transferAccountId } : undefined;
  const category = value.what !== "none" && value.what !== "transfer" && value.categoryId ? { kind: "category" as const, categoryId: value.categoryId } : undefined;
  return {
    transactionIds: ids,
    what: transfer ?? category,
    merchantId: value.what === "transfer" || value.merchant === "none" ? undefined : value.merchantId,
    addTagIds: value.addTagIds.length > 0 ? value.addTagIds : undefined,
    removeTagIds: value.removeTagIds.length > 0 ? value.removeTagIds : undefined,
  };
}

function changesSomething(value: typeof bulkValues) {
  return value.what !== "none" || value.merchant !== "none" || value.addTagIds.length > 0 || value.removeTagIds.length > 0;
}

function dateRange(rows: Transaction[]) {
  const dates = rows.map((row) => row.date).toSorted();
  const first = dates[0] ?? "";
  const last = dates.at(-1) ?? first;
  return first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`;
}

function BulkForm({ rows }: { rows: Transaction[] }) {
  const { close } = useEditorFrame();
  const save = useBulkEdit();
  const accountLabels = useAccountLabels();
  const ids = rows.map((row) => row.id);
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  const accountId = accountIds.length === 1 ? (accountIds[0] ?? null) : null;
  const presentTags = [...new Set(rows.flatMap((row) => row.lines.flatMap((line) => line.tagIds)))];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  const form = useAppForm({
    defaultValues: bulkValues,
    validators: {
      onSubmit: ({ value }) => {
        if (value.what === "transfer" && !value.transferAccountId) {
          return "Choose the other account.";
        }
        if (value.what !== "none" && value.what !== "transfer" && !value.categoryId) {
          return "Choose a category.";
        }
        return changesSomething(value) ? undefined : "Change at least one field.";
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(bulkBody(ids, accountId, value));
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: transactionError(errorCode(error)), fields: {} } });
      }
    },
  });
  const changed = useStore(form.store, (state) => changesSomething(state.values));
  const transfer = useStore(form.store, (state) => state.values.what === "transfer");
  const count = rows.length === 1 ? "1 transaction" : `${rows.length} transactions`;

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>{`Edit ${count}`}</DialogTitle>
          <DialogDescription>
            {`${accountId ? (accountLabels.get(accountId) ?? "Account") : `${accountIds.length} accounts`} · ${dateRange(rows)} · Total `}
            <Amount value={total} />
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <BulkWhatField form={form} choices={choicesFor(rows, accountId)} accountId={accountId} />
          {transfer ? null : <BulkMerchantField form={form} />}
          <BulkTagFields form={form} present={presentTags} />
          <form.FormError />
          <SelectedRows rows={rows} />
        </DialogBody>
        <DialogFooter>
          <FormCancel>Cancel</FormCancel>
          <form.SubmitButton disabled={!changed} saving="Saving">
            {`Save ${count}`}
          </form.SubmitButton>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}

/** A short list of the selected rows: date, payee, current category and amount. */
function SelectedRows({ rows }: { rows: Transaction[] }) {
  const targetText = useTargetText();
  return (
    <section aria-label="Selected transactions" className="grid gap-2">
      <h3 className="text-sm font-semibold">Selected transactions</h3>
      <div className="overflow-hidden rounded-xl border">
        {rows.map((row) => (
          <ListRow key={row.id} simple>
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{formatDate(row.date)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{row.payeeRaw}</span>
            <span className="min-w-0 truncate text-sm text-muted-foreground">{targetText(row.lines[0] ?? { categoryId: null, transferAccountId: null })}</span>
            <Amount value={row.amount} />
          </ListRow>
        ))}
      </div>
    </section>
  );
}
