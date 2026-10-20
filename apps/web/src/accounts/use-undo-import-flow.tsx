import type { ImportBatch, ImportUndo } from "@num/shared";
import { useUndoImport } from "@/api/imports";
import { formatStatementDate, undoBlockLabel } from "@/accounts/import-format";
import { Amount } from "@/components/amount";
import { useEditors } from "@/editors/editor-api";

/** Ask, then undo an import. The result is the undone import, or null when the person did not confirm or the undo failed. */
export function useUndoImportFlow() {
  const { confirm } = useEditors();
  const undoImport = useUndoImport();
  async function undo(item: Pick<ImportBatch, "id" | "filename">): Promise<ImportUndo | null> {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Remove the transactions from ${item.filename} that are still unchanged. Matched rows lose their link.`,
      confirmLabel: "Undo",
    });
    if (!ok) {
      return null;
    }
    try {
      const result = await undoImport.mutateAsync(item.id);
      if (result.blocked.length > 0) {
        void showBlocked(result.blocked);
      }
      return result;
    } catch {
      // The mutation shows the error in a toast.
      return null;
    }
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

  return undo;
}
