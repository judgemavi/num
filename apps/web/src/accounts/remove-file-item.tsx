import type { ImportViewItem } from "@num/shared";
import { useEraseDocument } from "@/api/documents";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";

function keptText(count: number) {
  if (count === 0) {
    return "The file is erased. The import stays in the list.";
  }
  return count === 1 ? "The file is erased. Its 1 transaction stays." : `The file is erased. Its ${count} transactions stay.`;
}

/** The "Remove file" item of an import menu. It asks for a confirmation, then erases the stored file. */
export function RemoveFileMenuItem({ item }: { item: ImportViewItem }) {
  const { confirm } = useEditors();
  const erase = useEraseDocument();
  const documentId = item.documentId;
  if (!documentId || item.documentDeletedAt) {
    return null;
  }
  return (
    <DropdownMenuItem
      className="min-h-11"
      onSelect={() => {
        void confirm({ title: "Remove the file?", description: keptText(item.transactionCount), confirmLabel: "Remove" }).then((ok) => {
          if (ok) {
            erase.mutate(documentId);
          }
        });
      }}
    >
      Remove file
    </DropdownMenuItem>
  );
}
