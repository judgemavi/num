import { columnMapSchema, statementDate, type ColumnMap, type DateOrder, type DecimalSeparator, type SignConvention } from "@num/shared";
import { useStore } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";

type ImportMapFormProps = {
  rows: string[][];
  onBack: () => void;
  onImport: (map: ColumnMap) => void;
};

const none = "none";

const headerOptions = [
  { value: "auto", label: "Detect the header" },
  { value: "yes", label: "The first row is a header" },
  { value: "no", label: "There is no header" },
] as const;

type HeaderChoice = (typeof headerOptions)[number]["value"];

const amountModeOptions = [
  { value: "amount", label: "One amount column" },
  { value: "split", label: "Separate debit and credit columns" },
] as const;

const dateOrderOptions = [
  { value: "mdy", label: "Month, then day" },
  { value: "dmy", label: "Day, then month" },
] as const;

const decimalOptions = [
  { value: ".", label: "Point (.)" },
  { value: ",", label: "Comma (,)" },
] as const;

const signOptions = [
  { value: "account", label: "Use the sign in the file" },
  { value: "inverted", label: "Flip the sign" },
] as const;

function headerValue(choice: HeaderChoice): ColumnMap["hasHeader"] {
  if (choice === "yes") {
    return true;
  }
  if (choice === "no") {
    return false;
  }
  return "auto";
}

function columnCount(rows: string[][]) {
  return Math.max(1, ...rows.map((row) => row.length));
}

/** The start values of the column map: the first columns, in the usual order of a bank file. */
function mapValues(width: number) {
  return {
    headerChoice: fieldValue<HeaderChoice>("auto"),
    date: "0",
    description: width > 1 ? "1" : "0",
    amountMode: fieldValue<(typeof amountModeOptions)[number]["value"]>("amount"),
    amount: width > 2 ? "2" : "0",
    debit: width > 2 ? "2" : "0",
    credit: width > 3 ? "3" : "0",
    balance: none,
    bankId: none,
    dateOrder: fieldValue<DateOrder>("mdy"),
    signConvention: fieldValue<SignConvention>("account"),
    decimalSeparator: fieldValue<DecimalSeparator>("."),
  };
}

function columnMap(value: ReturnType<typeof mapValues>) {
  return columnMapSchema.safeParse({
    hasHeader: headerValue(value.headerChoice),
    date: Number(value.date),
    description: Number(value.description),
    amount: value.amountMode === "amount" ? Number(value.amount) : null,
    debit: value.amountMode === "split" ? Number(value.debit) : null,
    credit: value.amountMode === "split" ? Number(value.credit) : null,
    balance: value.balance === none ? null : Number(value.balance),
    bankId: value.bankId === none ? null : Number(value.bankId),
    dateOrder: value.dateOrder,
    signConvention: value.signConvention,
    decimalSeparator: value.decimalSeparator,
  });
}

export function ImportMapForm({ rows, onBack, onImport }: ImportMapFormProps) {
  const width = columnCount(rows);
  const form = useAppForm({
    defaultValues: mapValues(width),
    validators: {
      onSubmit: ({ value }) => (columnMap(value).success ? undefined : "Choose a date, a description, and an amount."),
    },
    onSubmit: ({ value }) => {
      const map = columnMap(value);
      if (map.success) {
        onImport(map.data);
      }
    },
  });
  const { headerChoice, date, dateOrder, amountMode } = useStore(form.store, (state) => state.values);
  const hasHeader = headerValue(headerChoice);
  const firstDate = statementDate(rows[0]?.[Number(date)] ?? "", dateOrder);
  const header = hasHeader === true || (hasHeader === "auto" && firstDate === null) ? rows[0] : undefined;

  function label(index: number) {
    const name = header?.[index]?.trim() ?? "";
    return name.length > 0 ? `Column ${index + 1}: ${name}` : `Column ${index + 1}`;
  }

  const columns = Array.from({ length: width }, (_, index) => ({ value: String(index), label: label(index) }));
  const optionalColumns = [{ value: none, label: "None" }, ...columns];

  return (
    <form.AppForm>
      <DialogPanel>
        <DialogBody>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {columns.map((column) => (
                    <th key={column.value} className="px-3 py-2 font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-b-0">
                    {Array.from({ length: width }, (_, index) => (
                      <td key={index} className="px-3 py-2">
                        {row[index] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form.AppField name="headerChoice">
            {(field) => (
              <field.SelectField id="import-header" label="Header row" options={headerOptions} description="A date in the first row is a transaction." />
            )}
          </form.AppField>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="date">{(field) => <field.SelectField id="import-date" label="Date" options={columns} />}</form.AppField>
            <form.AppField name="description">{(field) => <field.SelectField id="import-description" label="Description" options={columns} />}</form.AppField>
          </div>
          <form.AppField name="amountMode">{(field) => <field.SelectField id="import-amount-mode" label="Amount" options={amountModeOptions} />}</form.AppField>
          {amountMode === "amount" ? (
            <form.AppField name="amount">{(field) => <field.SelectField id="import-amount" label="Amount column" options={columns} />}</form.AppField>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="debit">{(field) => <field.SelectField id="import-debit" label="Debit" options={columns} />}</form.AppField>
              <form.AppField name="credit">{(field) => <field.SelectField id="import-credit" label="Credit" options={columns} />}</form.AppField>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="balance">{(field) => <field.SelectField id="import-balance" label="Balance" options={optionalColumns} />}</form.AppField>
            <form.AppField name="bankId">{(field) => <field.SelectField id="import-bank" label="Bank ID" options={optionalColumns} />}</form.AppField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="dateOrder">{(field) => <field.SelectField id="import-date-order" label="Date order" options={dateOrderOptions} />}</form.AppField>
            <form.AppField name="decimalSeparator">
              {(field) => <field.SelectField id="import-decimal" label="Decimal separator" options={decimalOptions} />}
            </form.AppField>
          </div>
          <form.AppField name="signConvention">
            {(field) => (
              <field.SelectField
                id="import-sign"
                label="Sign"
                options={signOptions}
                description="Flip the sign when the bank shows spending as a positive amount."
              />
            )}
          </form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
          <form.SubmitButton inline>Import</form.SubmitButton>
        </DialogFooter>
      </DialogPanel>
    </form.AppForm>
  );
}
