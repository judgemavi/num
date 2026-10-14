import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors, type ConfirmOptions } from "@/editors/editor-api";

type ArchiveMenuItemProps = {
  /** True when the record is archived. The item then restores the record. */
  archived: boolean;
  /** The text of the confirmation. `restore` is true when the item restores the record. */
  question: (restore: boolean) => ConfirmOptions;
  /** The person confirmed. Do the write. */
  onConfirm: (restore: boolean) => void;
};

/** The "Archive" or "Restore" item of a row menu. It asks for a confirmation before the write. */
export function ArchiveMenuItem({ archived, question, onConfirm }: ArchiveMenuItemProps) {
  const { confirm } = useEditors();
  return (
    <DropdownMenuItem
      className="min-h-11"
      onSelect={() => {
        void confirm(question(archived)).then((ok) => {
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
