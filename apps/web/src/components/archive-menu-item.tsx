import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";

type ArchiveMenuItemProps = {
  /** True when the record is archived. The item then restores the record. */
  archived: boolean;
  noun: string;
  name: string;
  archiveDescription?: string;
  restoreDescription?: string;
  /** The person confirmed. Do the write. */
  onConfirm: (restore: boolean) => void;
};

/** The "Archive" or "Restore" item of a row menu. It asks for a confirmation before the write. */
export function ArchiveMenuItem({ archived, noun, name, archiveDescription, restoreDescription, onConfirm }: ArchiveMenuItemProps) {
  const { confirm } = useEditors();
  return (
    <DropdownMenuItem
      className="min-h-11"
      onSelect={() => {
        void confirm({
          title: `${archived ? "Restore" : "Archive"} ${name}?`,
          description: archived
            ? (restoreDescription ?? `The ${noun} returns to the active list.`)
            : (archiveDescription ?? `The ${noun} leaves the active list. You can restore it later.`),
          confirmLabel: archived ? "Restore" : "Archive",
        }).then((ok) => {
          if (ok) {
            onConfirm(archived);
          }
        });
      }}
    >
      {archived ? "Restore" : "Archive"}
    </DropdownMenuItem>
  );
}
