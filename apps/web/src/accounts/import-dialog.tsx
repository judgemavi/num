import {
  accountListSchema,
  importPresetListSchema,
  importResultSchema,
  type Account,
  type ColumnMap,
  type ImportResult,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ImportMapForm } from "@/accounts/import-map-form";
import { formatImportDate, importCountText, importError, unreadableLabel } from "@/accounts/import-format";
import { localAsOf } from "@/as-of";
import { loadAllPages } from "@/settings/load-all-pages";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ImportDialogProps = {
  open: boolean;
  account: Account | null;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

const savedFormat = "saved";

export function ImportDialog({ open, account, onOpenChange, onImported }: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
        {open ? (
          <ImportForm
            key={account?.id ?? "none"}
            account={account}
            onClose={() => onOpenChange(false)}
            onImported={onImported}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportForm({
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
  const [accountId, setAccountId] = useState(account?.id ?? "");
  const [presetId, setPresetId] = useState(savedFormat);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [result, setResult] = useState<Exclude<ImportResult, { kind: "preview" }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  const choices = accounts.data?.items ?? [];
  const known = account && !choices.some((item) => item.id === account.id) ? [account, ...choices] : choices;

  async function send(columnMap?: ColumnMap) {
    if (!file || accountId.length === 0) {
      setError("Choose an account and a file.");
      return;
    }
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("accountId", accountId);
    body.set("asOf", localAsOf());
    if (presetId !== savedFormat) {
      body.set("presetId", presetId);
    }
    if (columnMap) {
      body.set("columnMap", JSON.stringify(columnMap));
    }
    try {
      const response = await apiRequest("/api/imports", importResultSchema, { method: "POST", body });
      if (!response.ok) {
        setError(importError(response.code));
        return;
      }
      if (response.data.kind === "preview") {
        setPreview(response.data.rows);
        return;
      }
      setPreview(null);
      setResult(response.data);
      onImported();
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    } catch {
      setError(importError("internal_error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import a statement</DialogTitle>
        <DialogDescription>Upload a CSV, OFX or QFX file for one account.</DialogDescription>
      </DialogHeader>
      {result ? (
        <ImportSummary result={result} onClose={onClose} />
      ) : preview ? (
        <ImportMapForm rows={preview} pending={pending} onBack={() => setPreview(null)} onImport={(map) => void send(map)} />
      ) : (
        <div className="grid gap-4">
          <Field>
            <FieldLabel>Account</FieldLabel>
            <Select value={accountId || undefined} onValueChange={setAccountId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {known.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Bank format</FieldLabel>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={savedFormat}>Saved format, or set columns</SelectItem>
                {(presets.data ?? []).map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>An unknown CSV asks for the columns next.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>File</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
              <span className="text-sm text-muted-foreground">{file ? file.name : "CSV, OFX or QFX. Maximum 20 MB."}</span>
            </div>
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept=".csv,.ofx,.qfx,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-attn">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={pending || !file || accountId.length === 0} onClick={() => void send()}>
              {pending ? "Importing" : "Import"}
            </Button>
          </DialogFooter>
        </div>
      )}
      {preview && error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ImportSummary({ result, onClose }: { result: Exclude<ImportResult, { kind: "preview" }>; onClose: () => void }) {
  const counts =
    result.kind === "batch"
      ? result.counts
      : { created: 0, matched: 0, duplicate: 0, needsReview: 0, unreadable: result.unreadable.length };
  const unreadable = result.unreadable;
  return (
    <div className="grid gap-4">
      {result.kind === "batch" && result.alreadyImported ? (
        <p>This file was already imported{result.filename ? ` (${result.filename})` : ""}.</p>
      ) : (
        <p className="text-lg font-semibold">{importCountText(counts)}</p>
      )}
      {result.kind === "batch" && result.alreadyImported ? (
        <p className="text-lg font-semibold">{importCountText(counts)}</p>
      ) : null}
      {result.kind === "batch" ? (
        <p className="text-sm text-muted-foreground">{formatImportDate(result.createdAt)}</p>
      ) : null}
      {unreadable.length > 0 ? (
        <ul className="grid gap-3">
          {unreadable.map((row) => (
            <li key={`${row.line}-${row.raw}`} className="grid gap-1 border-t pt-3">
              <p className="font-semibold">
                Line {row.line}. {unreadableLabel(row.reason)}
              </p>
              <p className="break-all text-sm text-muted-foreground">{row.raw}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
