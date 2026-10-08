export function editFrom(search: Record<string, unknown>): string | undefined {
  return typeof search.edit === "string" && search.edit.length > 0 ? search.edit : undefined;
}

export function withEdit<T>(schema: { parse: (value: unknown) => T }, search: Record<string, unknown>): T & { edit?: string } {
  const parsed = schema.parse(search);
  const edit = editFrom(search);
  if (!edit) {
    return parsed as T & { edit?: string };
  }
  return { ...parsed, edit };
}

export function editOnly(search: Record<string, unknown>): { edit?: string } {
  const edit = editFrom(search);
  return edit ? { edit } : {};
}
