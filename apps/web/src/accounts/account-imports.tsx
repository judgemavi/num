import { importListSchema, importUndoSchema, type ImportBatch, type ImportUndo } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatImportDate, formatStatementDate, importCountText, importError, undoBlockLabel, unreadableLabel } from "@/accounts/import-format";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type AccountImportsProps = {
  accountId: string;
  accountName: string;
  currency: string;
};

export function AccountImports({ accountId, accountName, currency }: AccountImportsProps) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImportBatch | null>(null);
  const [blocked, setBlocked] = useState<ImportUndo["blocked"]>([]);
  const [error, setError] = useState<string | null>(null);

  const imports = useQuery({
    queryKey: ["imports", accountId],
    queryFn: async () => {
      const result = await apiRequest(`/api/accounts/${accountId}/imports`, importListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function confirmUndo() {
    if (!pendingId) {
      return;
    }
    const id = pendingId;
    const result = await apiRequest(`/api/imports/${id}/undo`, importUndoSchema, { method: "POST" });
    if (!result.ok) {
      setError(importError(result.code));
      setPendingId(null);
      return;
    }
    setPendingId(null);
    setBlocked(result.data.blocked);
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["imports", accountId] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["account"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  const pending = imports.data?.find((item) => item.id === pendingId);

  return (
    <div className="grid gap-3">
      <ListCard label={`Imports for ${accountName}`} title="Imports">
        {imports.isPending ? <p className="px-5 py-4 text-muted-foreground">Loading imports.</p> : null}
        {imports.isError ? <p className="px-5 py-4">The imports did not load.</p> : null}
        {imports.data && imports.data.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">No imports yet.</p>
        ) : null}
        {imports.data?.map((item) => (
          <ListRow key={item.id} simple onOpen={() => setDetail(item)}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{formatImportDate(item.createdAt)}</p>
              <p className="text-[13px] text-muted-foreground">
                {item.filename ?? "Statement"}
                {item.undoneAt ? " · Undone" : ""}
              </p>
            </div>
            <p className="text-right text-[13px] text-muted-foreground">{importCountText(item.counts)}</p>
            {item.undoneAt ? null : (
              <RowMenu label={`Actions for the import on ${formatImportDate(item.createdAt)}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => setPendingId(item.id)}>
                  Undo
                </DropdownMenuItem>
              </RowMenu>
            )}
          </ListRow>
        ))}
      </ListCard>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import detail</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.filename ?? "Statement"} · ${importCountText(detail.counts)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && detail.unreadable.length > 0 ? (
            <ul className="grid max-h-64 gap-3 overflow-y-auto">
              {detail.unreadable.map((row) => (
                <li key={`${row.line}-${row.raw}`} className="grid gap-1 border-t pt-3 text-sm">
                  <p className="font-semibold">
                    Line {row.line}. {unreadableLabel(row.reason)}
                  </p>
                  <p className="break-all text-muted-foreground">{row.raw}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every row was read.</p>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingId !== null} onOpenChange={(open) => !open && setPendingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `Remove the transactions from ${pending.filename ?? "this file"} that are still unchanged. Matched rows lose their link.`
                : "Remove the transactions from this import that are still unchanged."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmUndo()}>Undo import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={blocked.length > 0} onOpenChange={(open) => !open && setBlocked([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some rows stayed</AlertDialogTitle>
            <AlertDialogDescription>
              These rows were edited or reconciled, so this undo left them in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid max-h-64 gap-3 overflow-y-auto">
            {blocked.map((row) => (
              <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold">
                  {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                </p>
                <p className="text-muted-foreground">
                  <Amount currency={currency} minor={row.amount} /> · {undoBlockLabel(row.reason)}
                </p>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlocked([])}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
