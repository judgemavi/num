import {
  accountListSchema,
  chosenPresetId,
  firstStatementDate,
  guessImportAccount,
  orderByFirstDate,
  importPresetListSchema,
  importResultSchema,
  sampleCsvRows,
  type Account,
  type ColumnMap,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ImportDropZone, ImportFileList, type ImportFileRow } from "@/accounts/import-file-list";
import { importError } from "@/accounts/import-format";
import { ImportMapForm } from "@/accounts/import-map-form";
import { dateFor, formatFromChoice, knownAccount, readImportFile, rowNeedsColumnMap, syncImportRows } from "@/accounts/import-prepare";
import { localAsOf } from "@/as-of";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ImportForm({
  account,
  onClose,
  onImported,
}: {
  account: Account | null;
  onClose: () => void;
  onImported: () => void;
}) {
  const queryClient = useQueryClient();
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

  const accounts = useQuery({
    queryKey: ["accounts", "import-choices"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const presets = useQuery({
    queryKey: ["import-presets"],
    queryFn: async () => {
      const response = await apiRequest("/api/import-presets", importPresetListSchema);
      if (!response.ok) {
        throw new Error(response.code);
      }
      return response.data.presets;
    },
  });

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
    const body = new FormData();
    body.set("file", row.file);
    body.set("accountId", row.accountId);
    body.set("asOf", localAsOf());
    const presetId = chosenPresetId(row.format);
    if (presetId) {
      body.set("presetId", presetId);
    }
    if (row.columnMap) {
      body.set("columnMap", JSON.stringify(row.columnMap));
    }
    try {
      const response = await apiRequest("/api/imports", importResultSchema, { method: "POST", body });
      if (!response.ok) {
        updateRow(row.key, { phase: "error", message: importError(response.code) });
        return "ok";
      }
      if (response.data.kind === "preview") {
        if (!allowPreview) {
          updateRow(row.key, { phase: "error", message: importError("invalid_body") });
          return "ok";
        }
        const map = await askForMap(row, response.data.rows);
        if (!map) {
          updateRow(row.key, { phase: "ready" });
          return "cancelled";
        }
        const firstDate = firstStatementDate(row.text, { kind: "unknown" }, presetList, map);
        updateRow(row.key, { columnMap: map, firstDate, phase: "ready" });
        const latest = rowsRef.current.find((item) => item.key === row.key);
        return latest ? postFile(latest, false) : "cancelled";
      }
      if (response.data.kind === "unreadable") {
        updateRow(row.key, {
          phase: "done",
          alreadyImported: false,
          batchId: null,
          createdAt: null,
          unreadable: response.data.unreadable,
          counts: { created: 0, matched: 0, duplicate: 0, needsReview: 0, unreadable: response.data.unreadable.length },
        });
        return "ok";
      }
      updateRow(row.key, {
        phase: "done",
        alreadyImported: response.data.alreadyImported,
        counts: response.data.alreadyImported ? null : response.data.counts,
        unreadable: response.data.unreadable,
        batchId: response.data.id,
        createdAt: response.data.createdAt,
        message: null,
      });
      return "ok";
    } catch {
      updateRow(row.key, { phase: "error", message: importError("internal_error") });
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
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
        <div className="grid gap-4">
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
            />
          ) : null}
          {presets.isError ? (
            <p role="alert" className="text-sm text-attn">
              The bank formats did not load.
            </p>
          ) : null}
          <DialogFooter>
            {finished ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy || rows.length === 0} onClick={() => void importAll()}>
                  {pending ? "Importing" : importLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      )}
    </>
  );
}

