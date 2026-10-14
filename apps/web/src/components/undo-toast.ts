import { toast } from "sonner";

/** The success toast of a write that can be undone. "Undo" runs `undo`, a write with an existing undo route. */
export function undoToast(text: string, undo: () => void) {
  toast.success(text, { action: { label: "Undo", onClick: undo } });
}
