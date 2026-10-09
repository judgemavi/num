import { columnMapSchema, statementDate, type ColumnMap, type DateOrder, type DecimalSeparator, type SignConvention } from "@num/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ImportMapFormProps = {
  rows: string[][];
  pending: boolean;
  onBack: () => void;
  onImport: (map: ColumnMap) => void;
};

const none = "none";

type HeaderChoice = "auto" | "yes" | "no";

function headerValue(choice: HeaderChoice): ColumnMap["hasHeader"] {
  if (choice === "yes") {
    return true;
  }
  if (choice === "no") {
    return false;
  }
  return "auto";
}

function columnCount(rows: string[][]): number {
  return Math.max(1, ...rows.map((row) => row.length));
}

export function ImportMapForm({ rows, pending, onBack, onImport }: ImportMapFormProps) {
  const width = columnCount(rows);
  const [headerChoice, setHeaderChoice] = useState<HeaderChoice>("auto");
  const [date, setDate] = useState("0");
  const [description, setDescription] = useState(width > 1 ? "1" : "0");
  const [amountMode, setAmountMode] = useState<"amount" | "split">("amount");
  const [amount, setAmount] = useState(width > 2 ? "2" : "0");
  const [debit, setDebit] = useState(width > 2 ? "2" : "0");
  const [credit, setCredit] = useState(width > 3 ? "3" : "0");
  const [balance, setBalance] = useState(none);
  const [bankId, setBankId] = useState(none);
  const [dateOrder, setDateOrder] = useState<DateOrder>("mdy");
  const [signConvention, setSignConvention] = useState<SignConvention>("account");
  const [decimalSeparator, setDecimalSeparator] = useState<DecimalSeparator>(".");
  const [error, setError] = useState<string | null>(null);
  const hasHeader = headerValue(headerChoice);
  const firstDate = statementDate(rows[0]?.[Number(date)] ?? "", dateOrder);
  const header = hasHeader === true || (hasHeader === "auto" && firstDate === null) ? rows[0] : undefined;

  function label(index: number): string {
    const name = header?.[index]?.trim() ?? "";
    return name.length > 0 ? `Column ${index + 1}: ${name}` : `Column ${index + 1}`;
  }

  function submit() {
    const map = {
      hasHeader: headerValue(headerChoice),
      date: Number(date),
      description: Number(description),
      amount: amountMode === "amount" ? Number(amount) : null,
      debit: amountMode === "split" ? Number(debit) : null,
      credit: amountMode === "split" ? Number(credit) : null,
      balance: balance === none ? null : Number(balance),
      bankId: bankId === none ? null : Number(bankId),
      dateOrder,
      signConvention,
      decimalSeparator,
    };
    const parsed = columnMapSchema.safeParse(map);
    if (!parsed.success) {
      setError("Choose a date, a description, and an amount.");
      return;
    }
    setError(null);
    onImport(parsed.data);
  }

  return (
    <DialogPanel>
      <DialogBody>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              {Array.from({ length: width }, (_, index) => (
                <th key={index} className="px-3 py-2 font-semibold">
                  {label(index)}
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
      <Field>
        <FieldLabel>Header row</FieldLabel>
        <Select
          value={headerChoice}
          onValueChange={(value) => setHeaderChoice(value === "yes" || value === "no" ? value : "auto")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Detect the header</SelectItem>
            <SelectItem value="yes">The first row is a header</SelectItem>
            <SelectItem value="no">There is no header</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>A date in the first row is a transaction.</FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect id="import-date" label="Date" value={date} width={width} labelFor={label} onChange={setDate} />
        <ColumnSelect
          id="import-description"
          label="Description"
          value={description}
          width={width}
          labelFor={label}
          onChange={setDescription}
        />
      </div>
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <Select value={amountMode} onValueChange={(value) => setAmountMode(value === "split" ? "split" : "amount")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="amount">One amount column</SelectItem>
            <SelectItem value="split">Separate debit and credit columns</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {amountMode === "amount" ? (
        <ColumnSelect id="import-amount" label="Amount column" value={amount} width={width} labelFor={label} onChange={setAmount} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnSelect id="import-debit" label="Debit" value={debit} width={width} labelFor={label} onChange={setDebit} />
          <ColumnSelect id="import-credit" label="Credit" value={credit} width={width} labelFor={label} onChange={setCredit} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          id="import-balance"
          label="Balance"
          value={balance}
          width={width}
          labelFor={label}
          onChange={setBalance}
          optional
        />
        <ColumnSelect
          id="import-bank"
          label="Bank ID"
          value={bankId}
          width={width}
          labelFor={label}
          onChange={setBankId}
          optional
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Date order</FieldLabel>
          <Select value={dateOrder} onValueChange={(value) => setDateOrder(value === "dmy" ? "dmy" : "mdy")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mdy">Month, then day</SelectItem>
              <SelectItem value="dmy">Day, then month</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Decimal separator</FieldLabel>
          <Select
            value={decimalSeparator}
            onValueChange={(value) => setDecimalSeparator(value === "," ? "," : ".")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=".">Point (.)</SelectItem>
              <SelectItem value=",">Comma (,)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel>Sign</FieldLabel>
        <Select
          value={signConvention}
          onValueChange={(value) => setSignConvention(value === "inverted" ? "inverted" : "account")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="account">Use the sign in the file</SelectItem>
            <SelectItem value="inverted">Flip the sign</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>Flip the sign when the bank shows spending as a positive amount.</FieldDescription>
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Importing" : "Import"}
        </Button>
      </DialogFooter>
    </DialogPanel>
  );
}

function ColumnSelect({
  id,
  label,
  value,
  width,
  labelFor,
  onChange,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  width: number;
  labelFor: (index: number) => string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value={none}>None</SelectItem> : null}
          {Array.from({ length: width }, (_, index) => (
            <SelectItem key={index} value={String(index)}>
              {labelFor(index)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
