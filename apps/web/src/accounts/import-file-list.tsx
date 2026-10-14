import type { Account, ColumnMap, ImportCounts, OpeningSuggestion, Preset, StatementFormat, UnreadableRow } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { DragEvent, RefObject } from "react";
import { accountQuery, useSetOpeningBalance } from "@/api/accounts";
import { formatImportDate, importCountText, unreadableLabel } from "@/accounts/import-format";
import { accountLabel } from "@/accounts/label";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { rowNeedsColumnMap, totalCounts } from "@/accounts/import-prepare";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ImportFileRow = {
  key: string;
  file: File;
  text: string;
  format: StatementFormat;
  formatTouched: boolean;
  accountId: string;
  accountTouched: boolean;
  columnMap: ColumnMap | null;
  firstDate: string | null;
  phase: "ready" | "importing" | "done" | "error";
  message: string | null;
  counts: ImportCounts | null;
  batchId: string | null;
  alreadyImported: boolean;
  unreadable: UnreadableRow[];
  createdAt: string | null;
  openingSuggestion: OpeningSuggestion | null;
};

const columnsValue = "columns";
const ofxValue = "ofx";

function formatChoice(format: StatementFormat): string {
  if (format.kind === "ofx") {
    return ofxValue;
  }
  if (format.kind === "preset") {
    return format.presetId;
  }
  if (format.kind === "ambiguous") {
    return format.candidates[0] ?? columnsValue;
  }
  return columnsValue;
}

export function ImportDropZone({
  inputRef,
  dragOver,
  disabled,
  onDragOver,
  onDragLeave,
  onDrop,
  onChoose,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  dragOver: boolean;
  disabled: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div
      className={`grid gap-3 rounded-xl border border-dashed p-4 ${dragOver ? "border-primary bg-primary-soft" : "border-input"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={disabled} onClick={onChoose}>
          Choose files
        </Button>
        <span className="text-sm text-muted-foreground">Drop files here.</span>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        accept=".csv,.ofx,.qfx,text/csv"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
        }}
      />
    </div>
  );
}

type ImportFileListProps = {
  rows: ImportFileRow[];
  presets: Preset[];
  accounts: Account[];
  disabled: boolean;
  applyAccountId: string | null;
  showTotal: boolean;
  onFormat: (key: string, value: string) => void;
  onAccount: (key: string, accountId: string | null) => void;
  onApplyAccount: (accountId: string | null) => void;
  onOpenImport: () => void;
  onOpeningApplied: (key: string) => void;
};

export function ImportFileList({
  rows,
  presets,
  accounts,
  disabled,
  applyAccountId,
  showTotal,
  onFormat,
  onAccount,
  onApplyAccount,
  onOpenImport,
  onOpeningApplied,
}: ImportFileListProps) {
  const options = accounts.map((account) => ({ id: account.id, label: accountLabel(account) }));

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="import-all-accounts">Use this account for all files</FieldLabel>
        <OptionCombobox
          id="import-all-accounts"
          value={applyAccountId}
          options={options}
          placeholder="Choose an account"
          disabled={disabled}
          onChange={onApplyAccount}
        />
      </Field>
      <ul className="grid gap-0">
        {rows.map((row) => (
          <li key={row.key} className="grid gap-3 border-t border-border py-4">
            <p className="truncate font-semibold" title={row.file.name}>
              {row.file.name}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field>
                <FieldLabel>Format</FieldLabel>
                <Select value={formatChoice(row.format)} disabled={disabled || row.phase !== "ready"} onValueChange={(value) => onFormat(row.key, value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ofxValue}>OFX</SelectItem>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={columnsValue}>Set columns</SelectItem>
                  </SelectContent>
                </Select>
                {row.format.kind === "ambiguous" ? (
                  <FieldDescription>More than one format fits. Choose one.</FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Account</FieldLabel>
                <OptionCombobox
                  id={`import-account-${row.key}`}
                  value={row.accountId.length > 0 ? row.accountId : null}
                  options={options}
                  placeholder="Choose an account"
                  disabled={disabled || row.phase !== "ready"}
                  onChange={(accountId) => onAccount(row.key, accountId)}
                />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <FileStatus row={row} onOpenImport={onOpenImport} onOpeningApplied={() => onOpeningApplied(row.key)} />
              </Field>
            </div>
          </li>
        ))}
      </ul>
      {showTotal ? <p className="text-lg font-semibold">Total: {importCountText(totalCounts(rows))}</p> : null}
    </div>
  );
}

function OpeningBalanceButton({ row, onApplied }: { row: ImportFileRow; onApplied: () => void }) {
  const currency = useBookCurrency();
  const suggestion = row.openingSuggestion;
  const account = useQuery(accountQuery(row.accountId.length > 0 ? row.accountId : null));
  const opening = useSetOpeningBalance();
  if (!suggestion || row.accountId.length === 0) {
    return null;
  }
  const message = account.isError ? "The account did not load." : opening.isError ? "The opening balance did not save." : null;
  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={opening.isPending || !currency.data || !account.data}
        onClick={() => {
          if (account.data) {
            opening.mutate({ account: account.data, suggestion }, { onSuccess: onApplied });
          }
        }}
      >
        Set the opening balance from this statement
        {currency.data ? ` · ${formatMoney(currency.data, suggestion.amount)}` : ""}
      </Button>
      {message ? <p className="text-sm text-attn">{message}</p> : null}
    </div>
  );
}

function FileStatus({ row, onOpenImport, onOpeningApplied }: { row: ImportFileRow; onOpenImport: () => void; onOpeningApplied: () => void }) {
  const message = statusMessage(row);
  return (
    <div className="grid gap-1">
      <p className={row.phase === "error" ? "text-sm text-attn" : "text-sm"} role={row.phase === "error" ? "alert" : undefined}>
        {message}
      </p>
      {row.createdAt && row.phase === "done" && !row.alreadyImported ? (
        <p className="text-sm text-muted-foreground">{formatImportDate(row.createdAt)}</p>
      ) : null}
      {row.phase === "done" && row.openingSuggestion ? <OpeningBalanceButton row={row} onApplied={onOpeningApplied} /> : null}
      {row.batchId ? (
        <Link
          to="/accounts/imports/$importId"
          params={{ importId: row.batchId }}
          className="inline-flex min-h-11 items-center font-semibold text-primary"
          onClick={onOpenImport}
        >
          View import
        </Link>
      ) : null}
      {row.unreadable.length > 0 ? (
        <ul className="grid gap-2">
          {row.unreadable.map((item) => (
            <li key={`${item.line}-${item.raw}`} className="grid gap-1">
              <p className="text-sm font-semibold">
                Line {item.line}. {unreadableLabel(item.reason)}
              </p>
              <p className="break-all text-sm text-muted-foreground">{item.raw}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function statusMessage(row: ImportFileRow): string {
  if (row.phase === "importing") {
    return "Importing";
  }
  if (row.phase === "error") {
    return row.message ?? "Something went wrong on the server. The server log has the details.";
  }
  if (row.phase === "done") {
    if (row.alreadyImported) {
      return "Already imported";
    }
    return row.counts ? importCountText(row.counts) : "No rows";
  }
  if (row.accountId.length === 0) {
    return "Choose an account";
  }
  if (rowNeedsColumnMap(row)) {
    return "Set columns";
  }
  return "Ready";
}
