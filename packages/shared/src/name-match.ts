export type NamedId = {
  id: string;
  name: string;
};

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

/** An archived record whose name matches the typed text, when no active record has that name. */
export function archivedNameMatch(query: string, activeNames: readonly string[], archived: readonly NamedId[]): NamedId | null {
  const needle = query.trim();
  if (needle.length === 0 || activeNames.some((name) => sameName(name, needle))) {
    return null;
  }
  const hits = archived.filter((item) => sameName(item.name, needle));
  hits.sort((left, right) => left.id.localeCompare(right.id));
  return hits[0] ?? null;
}
