/** A blank field has no stored text. */
export function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}
