import type { ImportBatch, ImportUndo } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { accountImportsQuery, useUndoImport } from "@/api/imports";
import { formatImportDate, formatStatementDate, importCountText, importError, undoBlockLabel } from "@/accounts/import-format";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type AccountImportsProps = {
  accountId: string;
  accountName: string;
  currency: string;
};

export function AccountImports({ accountId, accountName, currency }: AccountImportsProps) {
  const { openEditor, confirm } = useEditors();
  const imports = useQuery(accountImportsQuery(accountId));
  const undoImport = useUndoImport();
  const error = undoImport.error ? importError(errorCode(undoImport.error)) : null;

  async function undo(item: ImportBatch) {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Remove the transactions from ${item.filename ?? "this file"} that are still unchanged. Matched rows lose their link.`,
      confirmLabel: "Undo import",
    });
    if (!ok) {
      return;
    }
    undoImport.mutate(item.id, {
      onSuccess: (result) => {
        if (result.blocked.length > 0) {
          void showBlocked(result.blocked);
        }
      },
    });
  }

  function showBlocked(blocked: ImportUndo["blocked"]) {
    return confirm({
      title: "Some rows stayed",
      description: (
        <div className="grid gap-3">
          <p>These rows were edited or reconciled, so this undo left them in place.</p>
          <ul className="grid max-h-64 gap-3 overflow-y-auto">
            {blocked.map((row) => (
              <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold text-foreground">
                  {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                </p>
                <p>
                  <Amount currency={currency} minor={row.amount} /> · {undoBlockLabel(row.reason)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ),
      confirmLabel: "Close",
      hideCancel: true,
    });
  }

  return (
    <div className="grid gap-3">
      <ListCard label={`Imports for ${accountName}`} title="Imports">
        {imports.isPending ? <p className="px-5 py-4 text-muted-foreground">Loading imports.</p> : null}
        {imports.isError ? <p className="px-5 py-4">The imports did not load.</p> : null}
        {imports.data && imports.data.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">No imports yet.</p>
        ) : null}
        {imports.data?.map((item) => (
          <ListRow
            key={item.id}
            simple
            onOpen={() => void openEditor("importInfo", { filename: item.filename, counts: item.counts, unreadable: item.unreadable })}
          >
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
                <DropdownMenuItem className="min-h-11" onSelect={() => void undo(item)}>
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
    </div>
  );
}
