import {
  chosenPresetId,
  firstStatementDate,
  guessImportAccount,
  orderByFirstDate,
  sampleCsvRows,
  type Account,
  type ColumnMap,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ImportDropZone, ImportFileList, type ImportFileRow } from "@/accounts/import-file-list";
import { importError } from "@/accounts/import-format";
import { ImportMapForm } from "@/accounts/import-map-form";
import { dateFor, formatFromChoice, knownAccount, readImportFile, rowNeedsColumnMap, syncImportRows } from "@/accounts/import-prepare";
import { localAsOf } from "@/as-of";
import { activeAccountsQuery } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { importPresetsQuery, useImportFile } from "@/api/imports";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";

export function ImportForm({
  account,
  onClose,
  onImported,
}: {
  account: Account | null;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<ImportFileRow[]>([]);
  const pendingRef = useRef(false);
  const mapWait = useRef<{ resolve: (map: ColumnMap | null) => void } | null>(null);
  const [rows, setRows] = useState<ImportFileRow[]>([]);
  const [applyAccountId, setApplyAccountId] = useState<string | null>(null);
  const [columnFile, setColumnFile] = useState<{ key: string; name: string; rows: string[][] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const fallbackId = account?.id ?? "";

  const accounts = useQuery(activeAccountsQuery());
  const presets = useQuery(importPresetsQuery());
  const importFile = useImportFile();

  const presetList = presets.data ?? [];
  const loaded = accounts.data?.items ?? [];
  const known = account && !loaded.some((item) => item.id === account.id) ? [account, ...loaded] : loaded;

  useEffect(() => {
    if (!presets.data || !accounts.data || pendingRef.current) {
      return;
    }
    const presetRows = presets.data;
    const accountRows = accounts.data.items;
    setRows((current) => {
      const next = syncImportRows(current, presetRows, accountRows, applyAccountId, fallbackId, account);
      if (!next) {
        return current;
      }
      rowsRef.current = next;
      return next;
    });
  }, [presets.data, accounts.data, applyAccountId, fallbackId, account]);

  useEffect(() => {
    return () => {
      mapWait.current?.resolve(null);
      mapWait.current = null;
    };
  }, []);

  function storeRows(next: ImportFileRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function updateRow(key: string, patch: Partial<ImportFileRow>) {
    storeRows(rowsRef.current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function addFiles(list: File[]) {
    if (list.length === 0) {
      return;
    }
    setReading(true);
    const added: ImportFileRow[] = [];
    for (const file of list) {
      added.push(await readImportFile(file, presetList, loaded, applyAccountId, fallbackId, account));
    }
    storeRows([...rowsRef.current, ...added]);
    setReading(false);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  function onFormat(key: string, value: string) {
    const format = formatFromChoice(value);
    const row = rowsRef.current.find((item) => item.key === key);
    if (!row) {
      return;
    }
    const accountId = row.accountTouched ? row.accountId : (applyAccountId ?? guessImportAccount(loaded, format, presetList) ?? fallbackId);
    const chosen = knownAccount(loaded, account, accountId);
    const columnMap = format.kind === "unknown" ? row.columnMap : null;
    updateRow(key, {
      format,
      formatTouched: true,
      columnMap,
      accountId,
      firstDate: dateFor(row.text, format, columnMap, chosen, presetList),
    });
  }

  function onAccount(key: string, accountId: string | null) {
    const id = accountId ?? "";
    const row = rowsRef.current.find((item) => item.key === key);
    if (!row) {
      return;
    }
    const chosen = knownAccount(loaded, account, id);
    updateRow(key, {
      accountId: id,
      accountTouched: true,
      firstDate: dateFor(row.text, row.format, row.columnMap, chosen, presetList),
    });
  }

  function onApplyAccount(accountId: string | null) {
    setApplyAccountId(accountId);
    if (!accountId) {
      return;
    }
    const chosen = knownAccount(loaded, account, accountId);
    storeRows(
      rowsRef.current.map((row) =>
        row.phase === "ready"
          ? { ...row, accountId, accountTouched: true, firstDate: dateFor(row.text, row.format, row.columnMap, chosen, presetList) }
          : row,
      ),
    );
  }

  function askForMap(row: ImportFileRow, preview: string[][]): Promise<ColumnMap | null> {
    setColumnFile({ key: row.key, name: row.file.name, rows: preview });
    return new Promise((resolve) => {
      mapWait.current = { resolve };
    });
  }

  function finishMap(map: ColumnMap | null) {
    mapWait.current?.resolve(map);
    mapWait.current = null;
    setColumnFile(null);
  }

  async function postFile(row: ImportFileRow, allowPreview: boolean): Promise<"ok" | "cancelled"> {
    if (row.accountId.length === 0) {
      updateRow(row.key, { phase: "error", message: importError("account_not_found") });
      return "ok";
    }
    updateRow(row.key, { phase: "importing", message: null });
    try {
      const result = await importFile.mutateAsync({
        file: row.file,
        accountId: row.accountId,
        asOf: localAsOf(),
        presetId: chosenPresetId(row.format),
        columnMap: row.columnMap,
      });
      if (result.kind === "preview") {
        if (!allowPreview) {
          updateRow(row.key, { phase: "error", message: importError("invalid_body") });
          return "ok";
        }
        const map = await askForMap(row, result.rows);
        if (!map) {
          updateRow(row.key, { phase: "ready" });
          return "cancelled";
        }
        const firstDate = firstStatementDate(row.text, { kind: "unknown" }, presetList, map);
        updateRow(row.key, { columnMap: map, firstDate, phase: "ready" });
        const latest = rowsRef.current.find((item) => item.key === row.key);
        return latest ? postFile(latest, false) : "cancelled";
      }
      if (result.kind === "unreadable") {
        updateRow(row.key, {
          phase: "done",
          alreadyImported: false,
          batchId: null,
          createdAt: null,
          unreadable: result.unreadable,
          counts: { created: 0, matched: 0, duplicate: 0, needsReview: 0, unreadable: result.unreadable.length },
        });
        return "ok";
      }
      updateRow(row.key, {
        phase: "done",
        alreadyImported: result.alreadyImported,
        counts: result.alreadyImported ? null : result.counts,
        unreadable: result.unreadable,
        batchId: result.id,
        createdAt: result.createdAt,
        openingSuggestion: result.openingSuggestion,
        message: null,
      });
      return "ok";
    } catch (error) {
      updateRow(row.key, { phase: "error", message: importError(error instanceof Error ? errorCode(error) : undefined) });
      return "ok";
    }
  }

  async function importAll() {
    setPending(true);
    pendingRef.current = true;
    const waiting = rowsRef.current.filter((row) => row.phase === "ready" && rowNeedsColumnMap(row));
    for (const row of waiting) {
      const map = await askForMap(row, sampleCsvRows(row.text));
      if (!map) {
        pendingRef.current = false;
        setPending(false);
        return;
      }
      updateRow(row.key, {
        columnMap: map,
        firstDate: firstStatementDate(row.text, { kind: "unknown" }, presetList, map),
      });
    }
    const ordered = orderByFirstDate(rowsRef.current.filter((row) => row.phase === "ready"));
    for (const row of ordered) {
      const latest = rowsRef.current.find((item) => item.key === row.key) ?? row;
      const outcome = await postFile(latest, true);
      if (outcome === "cancelled") {
        pendingRef.current = false;
        setPending(false);
        return;
      }
    }
    if (rowsRef.current.some((row) => row.phase === "done")) {
      onImported();
    }
    setFinished(true);
    pendingRef.current = false;
    setPending(false);
  }

  const busy = pending || reading;
  const importLabel = rows.length > 1 ? "Import all" : "Import";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{columnFile ? "Set the columns" : finished ? "Import summary" : "Import statements"}</DialogTitle>
        <DialogDescription>
          {columnFile
            ? columnFile.name
            : "Choose or drop one or more CSV, OFX or QFX files. Maximum 20 MB each."}
        </DialogDescription>
      </DialogHeader>
      {columnFile ? (
        <ImportMapForm
          key={columnFile.key}
          rows={columnFile.rows}
          pending={false}
          onBack={() => finishMap(null)}
          onImport={(map) => finishMap(map)}
        />
      ) : (
        <DialogPanel>
          <DialogBody>
          {finished ? null : (
            <ImportDropZone
              inputRef={fileRef}
              dragOver={dragOver}
              disabled={busy}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
              onChoose={() => fileRef.current?.click()}
              onFiles={(files) => {
                void addFiles(files);
              }}
            />
          )}
          {rows.length > 0 ? (
            <ImportFileList
              rows={rows}
              presets={presetList}
              accounts={known}
              disabled={busy}
              applyAccountId={applyAccountId}
              showTotal={finished}
              onFormat={onFormat}
              onAccount={onAccount}
              onApplyAccount={onApplyAccount}
              onOpenImport={onClose}
              onOpeningApplied={(key) => updateRow(key, { openingSuggestion: null })}
            />
          ) : null}
          {presets.isError ? (
            <p role="alert" className="text-sm text-attn">
              The bank formats did not load.
            </p>
          ) : null}
          </DialogBody>
          <DialogFooter>
            {finished ? (
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            ) : (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" disabled={busy || rows.length === 0} onClick={() => void importAll()}>
                  {pending ? "Importing" : importLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogPanel>
      )}
    </>
  );
}

