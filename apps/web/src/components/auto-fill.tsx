import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useFill } from "@/api/funding";

/**
 * The automatic fill of the buckets. It runs when the app opens and after each successful write
 * that is not a fill. The fill is idempotent, thus a run that has nothing to pay writes nothing.
 */
export function AutoFill() {
  const queryClient = useQueryClient();
  const { mutate } = useFill();
  useEffect(() => {
    mutate();
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success" && !event.mutation.meta?.fill) {
        mutate();
      }
    });
  }, [queryClient, mutate]);
  return null;
}
