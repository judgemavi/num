import { requireCurrencyDigits, type BalanceCheck, type ColumnMap, type ImportCounts, type OpeningSuggestion, type ParsedStatement, type StatementFormat, type UnreadableRow } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type RefObject } from "react";
import { useSetOpeningBalance } from "@/api/accounts";
import { importPresetsQuery } from "@/api/imports";
import { ImportAccountPicker } from "@/accounts/import-account-picker";
import { ImportBalanceProblem } from "@/accounts/import-balance-problem";
import { brokenMatch, importCountText, sampleSummary, unreadableLabel } from "@/accounts/import-format";
import { ImportSample } from "@/accounts/import-sample";
import { useUndoImportFlow } from "@/accounts/use-undo-import-flow";
import { useEditorFrame } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { activeAccountsQuery } from "@/api/accounts";
import { dateRange, knownAccount, readStatement, rowNeedsColumnMap } from "@/accounts/import-prepare";
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
  /** The person undid the import from this row. */
  undone: boolean;
  unreadable: UnreadableRow[];
  createdAt: string | null;
  openingSuggestion: OpeningSuggestion | null;
  balanceCheck: BalanceCheck;
};

const columnsValue = "columns";
const ofxValue = "ofx";

function formatChoice(format: StatementFormat) {
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

/** The place where a person chooses or drops files. The editor owns the file input, because it clears the input after it reads the files. */
export function ImportDropZone({
  inputRef,
  disabled,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`grid gap-3 rounded-xl border border-dashed p-4 ${dragOver ? "border-primary bg-primary-soft" : "border-input"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
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

type RowChange = {
  onFormat: (key: string, value: string) => void;
  onAccount: (key: string, accountId: string | null) => void;
  onOpeningApplied: (key: string) => void;
  onUndone: (key: string) => void;
};

type ImportFileListProps = RowChange & {
  rows: ImportFileRow[];
  disabled: boolean;
  /** The account that the editor opened for. The account pickers show it also when it is archived. */
  editorAccountId: string | null;
};

export function ImportFileList({ rows, disabled, editorAccountId, ...change }: ImportFileListProps) {
  return (
    <ul className="grid gap-0">
      {rows.map((row) => (
        <FileRow key={row.key} row={row} disabled={disabled} editorAccountId={editorAccountId} {...change} />
      ))}
    </ul>
  );
}

/** The statement of a file that is ready, as the import will read it. It follows the format, the column map and the account. */
function useStatement(row: ImportFileRow): ParsedStatement | null {
  const { data: presets } = useSuspenseQuery(importPresetsQuery());
  const { data: accounts } = useSuspenseQuery(activeAccountsQuery());
  const digits = requireCurrencyDigits(useBookCurrency());
  const account = knownAccount(accounts.items, null, row.accountId);
  const ready = row.phase === "ready";
  const { text, format, columnMap } = row;
  return useMemo(
    () => (ready ? readStatement(text, format, columnMap, account, presets, digits) : null),
    [ready, text, format, columnMap, account, presets, digits],
  );
}

function FileRow({ row, disabled, editorAccountId, onFormat, onAccount, onOpeningApplied, onUndone }: RowChange & { row: ImportFileRow; disabled: boolean; editorAccountId: string | null }) {
  const { data: presets } = useSuspenseQuery(importPresetsQuery());
  const statement = useStatement(row);
  return (
    <li className="grid gap-3 border-t border-border py-4">
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
          <ImportAccountPicker
            id={`import-account-${row.key}`}
            value={row.accountId.length > 0 ? row.accountId : null}
            editorAccountId={editorAccountId}
            disabled={disabled || row.phase !== "ready"}
            onChange={(accountId) => onAccount(row.key, accountId)}
          />
        </Field>
        <Field>
          <FieldLabel>Status</FieldLabel>
          <FileStatus row={row} statement={statement} onOpeningApplied={() => onOpeningApplied(row.key)} onUndone={() => onUndone(row.key)} />
        </Field>
      </div>
      {statement ? <ImportSample statement={statement} /> : null}
    </li>
  );
}

function OpeningBalanceButton({ row, onApplied }: { row: ImportFileRow; onApplied: () => void }) {
  const currency = useBookCurrency();
  const opening = useSetOpeningBalance();
  const suggestion = row.openingSuggestion;
  if (!suggestion || row.accountId.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={opening.isPending}
        onClick={() => opening.mutate({ accountId: row.accountId, suggestion }, { onSuccess: onApplied })}
      >
        Set the opening balance from this statement
        {` · ${formatMoney(currency, suggestion.amount)}`}
      </Button>
    </div>
  );
}

/** The line and the action of an import that broke the match with the bank. */
function BrokenMatch({ row, difference, onUndone }: { row: ImportFileRow; difference: number; onUndone: () => void }) {
  const undo = useUndoImportFlow();
  const batchId = row.batchId;
  if (!batchId) {
    return null;
  }
  return (
    <>
      <ImportBalanceProblem difference={difference} />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void undo({ id: batchId, filename: row.file.name }).then((result) => {
            if (result) {
              onUndone();
            }
          });
        }}
      >
        Undo this import
      </Button>
    </>
  );
}

function FileStatus({ row, statement, onOpeningApplied, onUndone }: { row: ImportFileRow; statement: ParsedStatement | null; onOpeningApplied: () => void; onUndone: () => void }) {
  const { close } = useEditorFrame();
  const { data: accounts } = useSuspenseQuery(activeAccountsQuery());
  const account = accounts.items.find((account) => account.id === row.accountId);
  const message = statusMessage(row, account, statement);
  const difference = row.phase === "done" && !row.undone ? brokenMatch(row.balanceCheck) : null;
  return (
    <div className="grid gap-1">
      <p className={row.phase === "error" ? "text-sm text-attn" : "text-sm"} role={row.phase === "error" ? "alert" : undefined}>
        {message}
      </p>
      {difference !== null ? <BrokenMatch row={row} difference={difference} onUndone={onUndone} /> : null}
      {row.phase === "done" && !row.undone && row.openingSuggestion ? <OpeningBalanceButton row={row} onApplied={onOpeningApplied} /> : null}
      {row.batchId ? (
        <Link
          to="/accounts/imports/$importId"
          params={{ importId: row.batchId }}
          className="inline-flex min-h-11 items-center font-semibold text-primary"
          onClick={() => close()}
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

function statusMessage(row: ImportFileRow, account: { columnMap: ColumnMap | null } | undefined, statement: ParsedStatement | null) {
  if (row.phase === "importing") {
    return "Importing";
  }
  if (row.phase === "error") {
    return row.message ?? "Something went wrong on the server. The server log has the details.";
  }
  if (row.phase === "done") {
    if (row.undone) {
      return "Undone";
    }
    if (row.alreadyImported) {
      return "Already imported";
    }
    return row.counts ? importCountText(row.counts) : "No rows";
  }
  if (row.accountId.length === 0) {
    return "Choose an account";
  }
  if (rowNeedsColumnMap(row, account)) {
    return "Set columns";
  }
  const range = statement ? dateRange(statement) : null;
  return statement && range ? sampleSummary(statement.rows.length, range.first, range.last) : "Ready";
}
