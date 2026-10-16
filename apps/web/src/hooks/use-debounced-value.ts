import { useEffect, useState } from "react";
import { searchDelayMs } from "@/lists/list-search";

/** Wait for the same pause as the list search before a suggestion uses a field value. */
export function useDebouncedValue<T>(value: T) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), searchDelayMs);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}
