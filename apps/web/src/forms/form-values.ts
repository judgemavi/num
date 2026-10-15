/**
 * The start value of a form field, with the type of the field. A form infers the type of each field from its start
 * value. Use this when the start value is narrower than the field: `fieldValue<string | null>(null)`.
 */
export function fieldValue<T>(value: T): T {
  return value;
}

/**
 * The amount of a money field. While the text is the start text, the stored amount comes back and the text is not
 * read again. Thus an unchanged amount stays as it is stored, also when it has more digits than the currency has now.
 */
export function keptAmount(text: string, start: { text: string; amount: number } | null, read: (text: string) => number): number {
  return start !== null && text === start.text ? start.amount : read(text);
}

/**
 * The patch of an edit form: the fields of the request body that differ from the body of the start
 * values. Null when no field changed: the form then closes without a write.
 */
export function editPatch<B extends object>(body: B, start: B): Partial<B> | null {
  const patch: Partial<B> = {};
  let changed = false;
  for (const key in body) {
    if (JSON.stringify(body[key]) !== JSON.stringify(start[key])) {
      patch[key] = body[key];
      changed = true;
    }
  }
  return changed ? patch : null;
}
