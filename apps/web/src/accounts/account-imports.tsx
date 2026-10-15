import type { ImportBatch, ImportUndo } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { accountImportsQuery, useUndoImport } from "@/api/imports";
import { formatImportDate, formatStatementDate, importCountText, undoBlockLabel } from "@/accounts/import-format";
import { accountLabel } from "@/accounts/label";
import { useEditors } from "@/editors/editor-api";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** The imports of one account. The parent reads the account first, thus the read of the account here does not wait. */
export function AccountImports({ accountId }: { accountId: string }) {
  const { confirm } = useEditors();
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const undoImport = useUndoImport();

  async function undo(item: ImportBatch) {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Remove the transactions from ${item.filename ?? "this file"} that are still unchanged. Matched rows lose their link.`,
      confirmLabel: "Undo",
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
          <p>These rows were edited after import, so this undo left them in place.</p>
          <ul className="grid max-h-64 gap-3 overflow-y-auto">
            {blocked.map((row) => (
              <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold text-foreground">
                  {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                </p>
                <p>
                  <Amount value={row.amount} /> · {undoBlockLabel(row.reason)}
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
      <ListCard label={`Imports for ${accountLabel(account)}`} title="Imports">
        <Boundary look="rows" loading="Loading imports." failed="The imports did not load.">
          <ImportRows accountId={accountId} onUndo={(item) => void undo(item)} />
        </Boundary>
      </ListCard>
    </div>
  );
}

function ImportRows({ accountId, onUndo }: { accountId: string; onUndo: (item: ImportBatch) => void }) {
  const { openEditor } = useEditors();
  const { data: imports } = useSuspenseQuery(accountImportsQuery(accountId));
  if (imports.length === 0) {
    return <p className="px-5 py-4 text-muted-foreground">No imports yet.</p>;
  }
  return imports.map((item) => (
    <ListRow
      key={item.id}
      size="simple"
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
          <DropdownMenuItem className="min-h-11" onSelect={() => onUndo(item)}>
            Undo
          </DropdownMenuItem>
        </RowMenu>
      )}
    </ListRow>
  ));
}
