import { guessImportAccount, type ColumnMap } from "@num/shared";
import { usePrefetchQuery, useSuspenseQueries } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, useState } from "react";
import { emptyImportBatch, importBatchReducer, runImportBatch } from "@/accounts/import-batch";
import { ImportDropZone, ImportFileList, type ImportFileRow } from "@/accounts/import-file-list";
import { useImportAccount } from "@/accounts/import-account";
import { ImportAccountPicker } from "@/accounts/import-account-picker";
import { importCountText } from "@/accounts/import-format";
import { ImportMapForm } from "@/accounts/import-map-form";
import { dateFor, formatFromChoice, knownAccount, readImportFile, syncImportRows, totalCounts } from "@/accounts/import-prepare";
import { localAsOf } from "@/as-of";
import { activeAccountsQuery } from "@/api/accounts";
import { importPresetsQuery, useImportFile } from "@/api/imports";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";

/** The question that the editor asks for the column map of one file, and the function that gives the answer to the batch. */
type MapQuestion = { key: string; name: string; rows: string[][]; answer: (map: ColumnMap | null) => void };

export function ImportForm({ accountId }: EditorInput["import"]) {
  const { close } = useEditorFrame();
  // The read of the account and the reads of the two lists start together.
  usePrefetchQuery(activeAccountsQuery());
  usePrefetchQuery(importPresetsQuery());
  const account = useImportAccount(accountId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [batch, dispatch] = useReducer(importBatchReducer, emptyImportBatch);
  const [applyAccountId, setApplyAccountId] = useState<string | null>(null);
  const [question, setQuestion] = useState<MapQuestion | null>(null);
  const fallbackId = account?.id ?? "";

  const [{ data: accounts }, { data: presets }] = useSuspenseQueries({ queries: [activeAccountsQuery(), importPresetsQuery()] });
  const importFile = useImportFile();

  const loaded = accounts.items;
  const running = batch.phase === "running";
  const finished = batch.phase === "finished";
  const busy = running || batch.phase === "reading";
  // The format, the account and the first date of a file follow the presets and the accounts until the person changes
  // them. They do not change while the batch runs.
  const rows = running ? batch.rows : (syncImportRows(batch.rows, presets, loaded, applyAccountId, fallbackId, account) ?? batch.rows);

  // A batch that waits for a column map stops when the editor closes.
  useEffect(() => () => question?.answer(null), [question]);

  function changeRow(key: string, patch: Partial<ImportFileRow>) {
    dispatch({ type: "rowChanged", key, patch });
  }

  async function addFiles(list: File[]) {
    if (list.length === 0) {
      return;
    }
    dispatch({ type: "readingStarted" });
    const added: ImportFileRow[] = [];
    for (const file of list) {
      added.push(await readImportFile(file, presets, loaded, applyAccountId, fallbackId, account));
    }
    dispatch({ type: "filesRead", rows: added });
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  function onFormat(key: string, value: string) {
    const format = formatFromChoice(value);
    const row = rows.find((item) => item.key === key);
    if (!row) {
      return;
    }
    const accountId = row.accountTouched ? row.accountId : (applyAccountId ?? guessImportAccount(loaded, format, presets) ?? fallbackId);
    const chosen = knownAccount(loaded, account, accountId);
    const columnMap = format.kind === "unknown" ? row.columnMap : null;
    changeRow(key, {
      format,
      formatTouched: true,
      columnMap,
      accountId,
      firstDate: dateFor(row.text, format, columnMap, chosen, presets),
    });
  }

  function onAccount(key: string, accountId: string | null) {
    const id = accountId ?? "";
    const row = rows.find((item) => item.key === key);
    if (!row) {
      return;
    }
    const chosen = knownAccount(loaded, account, id);
    changeRow(key, {
      accountId: id,
      accountTouched: true,
      firstDate: dateFor(row.text, row.format, row.columnMap, chosen, presets),
    });
  }

  function onApplyAccount(accountId: string | null) {
    setApplyAccountId(accountId);
    if (!accountId) {
      return;
    }
    const chosen = knownAccount(loaded, account, accountId);
    dispatch({
      type: "rowsChanged",
      rows: rows.map((row) =>
        row.phase === "ready"
          ? { ...row, accountId, accountTouched: true, firstDate: dateFor(row.text, row.format, row.columnMap, chosen, presets) }
          : row,
      ),
    });
  }

  function askForMap(row: ImportFileRow, preview: string[][]) {
    return new Promise<ColumnMap | null>((answer) => {
      setQuestion({ key: row.key, name: row.file.name, rows: preview, answer });
    });
  }

  function answerMap(map: ColumnMap | null) {
    question?.answer(map);
    setQuestion(null);
  }

  async function importAll() {
    dispatch({ type: "batchStarted", rows });
    const result = await runImportBatch(rows, { presets, asOf: localAsOf(), post: importFile.mutateAsync, askForMap, onRow: changeRow });
    if (result.stopped) {
      dispatch({ type: "batchStopped" });
      return;
    }
    if (result.rows.some((row) => row.phase === "done")) {
      close("ok");
    }
    dispatch({ type: "batchFinished" });
  }

  const importLabel = rows.length > 1 ? "Import all" : "Import";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{question ? "Set the columns" : finished ? "Import summary" : "Import statements"}</DialogTitle>
        <DialogDescription>
          {question
            ? question.name
            : "Choose or drop one or more CSV, OFX or QFX files. Maximum 20 MB each."}
        </DialogDescription>
      </DialogHeader>
      {question ? (
        <ImportMapForm
          key={question.key}
          rows={question.rows}
          onBack={() => answerMap(null)}
          onImport={answerMap}
        />
      ) : (
        <DialogPanel>
          <DialogBody>
          {finished ? null : (
            <ImportDropZone
              inputRef={fileRef}
              disabled={busy}
              onFiles={(files) => {
                void addFiles(files);
              }}
            />
          )}
          {rows.length > 0 ? (
            <div className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="import-all-accounts">Use this account for all files</FieldLabel>
                <ImportAccountPicker id="import-all-accounts" value={applyAccountId} editorAccountId={accountId} disabled={busy} onChange={onApplyAccount} />
              </Field>
              <ImportFileList
                rows={rows}
                disabled={busy}
                editorAccountId={accountId}
                onFormat={onFormat}
                onAccount={onAccount}
                onOpeningApplied={(key) => changeRow(key, { openingSuggestion: null })}
              />
              {finished ? <p className="text-lg font-semibold">Total: {importCountText(totalCounts(rows))}</p> : null}
            </div>
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
                  {running ? "Importing" : importLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogPanel>
      )}
    </>
  );
}

