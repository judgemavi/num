import type { ColumnMap, ImportCounts, OpeningSuggestion, StatementFormat, UnreadableRow } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type RefObject } from "react";
import { accountQuery, useSetOpeningBalance } from "@/api/accounts";
import { importPresetsQuery } from "@/api/imports";
import { ImportAccountPicker } from "@/accounts/import-account-picker";
import { formatImportDate, importCountText, unreadableLabel } from "@/accounts/import-format";
import { Boundary } from "@/components/boundary";
import { useEditorFrame } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { rowNeedsColumnMap } from "@/accounts/import-prepare";
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

type ImportFileListProps = {
  rows: ImportFileRow[];
  disabled: boolean;
  /** The account that the editor opened for. The account pickers show it also when it is archived. */
  editorAccountId: string | null;
  onFormat: (key: string, value: string) => void;
  onAccount: (key: string, accountId: string | null) => void;
  onOpeningApplied: (key: string) => void;
};

export function ImportFileList({ rows, disabled, editorAccountId, onFormat, onAccount, onOpeningApplied }: ImportFileListProps) {
  const { data: presets } = useSuspenseQuery(importPresetsQuery());

  return (
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
              <FileStatus row={row} onOpeningApplied={() => onOpeningApplied(row.key)} />
            </Field>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OpeningBalanceButton({ row, onApplied }: { row: ImportFileRow; onApplied: () => void }) {
  if (!row.openingSuggestion || row.accountId.length === 0) {
    return null;
  }
  return (
    <Boundary look="panel" loading="Loading the account." failed="The account did not load.">
      <OpeningBalance accountId={row.accountId} suggestion={row.openingSuggestion} onApplied={onApplied} />
    </Boundary>
  );
}

function OpeningBalance({ accountId, suggestion, onApplied }: { accountId: string; suggestion: OpeningSuggestion; onApplied: () => void }) {
  const currency = useBookCurrency();
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const opening = useSetOpeningBalance();
  return (
    <div className="grid gap-1">
      <Button type="button" variant="outline" disabled={opening.isPending} onClick={() => opening.mutate({ account, suggestion }, { onSuccess: onApplied })}>
        Set the opening balance from this statement
        {` · ${formatMoney(currency, suggestion.amount)}`}
      </Button>
      {opening.isError ? <p className="text-sm text-attn">The opening balance did not save.</p> : null}
    </div>
  );
}

function FileStatus({ row, onOpeningApplied }: { row: ImportFileRow; onOpeningApplied: () => void }) {
  const { close } = useEditorFrame();
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

function statusMessage(row: ImportFileRow) {
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
