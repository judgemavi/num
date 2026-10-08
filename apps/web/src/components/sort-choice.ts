export function sortChoice(
  sort: string | undefined,
  dir: string | undefined,
  fallbackSort: string,
  fallbackDir: "asc" | "desc",
) {
  const column = sort ?? fallbackSort;
  const direction = dir ?? (sort === undefined ? fallbackDir : "asc");
  return `${column}:${direction}`;
}
