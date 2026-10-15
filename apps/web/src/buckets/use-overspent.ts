import { useSuspenseQuery } from "@tanstack/react-query";
import { overspentQuery } from "@/api/buckets";

/**
 * The overspent buckets that need the person. The fill covers a negative balance from Unassigned, thus the list has
 * the buckets that Unassigned could not cover.
 */
export function useOverspent() {
  return useSuspenseQuery(overspentQuery()).data;
}
