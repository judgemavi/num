import { useSuspenseQueries, type QueryKey, type UseSuspenseQueryOptions } from "@tanstack/react-query";

/** Read one record when its id exists. The caller defers a changing id to keep the form on the screen. */
export function useOptionalQuery<T, K extends QueryKey>(id: string | null, options: (id: string) => UseSuspenseQueryOptions<T, Error, T, K>) {
  const ids = id === null ? [] : [id];
  const queries = ids.map(options);
  return useSuspenseQueries({ queries }).at(0)?.data ?? null;
}
