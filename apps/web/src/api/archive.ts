import type { ErrorCode } from "@num/shared";
import { useMutation } from "@tanstack/react-query";
import { undoToast } from "@/components/undo-toast";

type ArchiveInput = { id: string; restore: boolean };

/**
 * The archive and restore write of one kind of record. After an archive, the success toast offers "Undo": it restores
 * the record with the same write.
 */
export function useArchiveWrite<T>(archived: string, errorText: (code: ErrorCode | undefined) => string, write: (input: ArchiveInput) => Promise<T>) {
  const undo = useMutation({ meta: { errorText }, mutationFn: write });
  return useMutation({
    meta: { errorText },
    mutationFn: write,
    onSuccess: (_record, { id, restore }) => {
      if (!restore) {
        undoToast(archived, () => undo.mutate({ id, restore: true }));
      }
    },
  });
}
