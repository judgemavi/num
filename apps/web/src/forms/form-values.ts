/**
 * The start value of a form field, with the type of the field. A form infers the type of each field from its start
 * value. Use this when the start value is narrower than the field: `fieldValue<string | null>(null)`.
 */
export function fieldValue<T>(value: T): T {
  return value;
}
