export function whole(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Sum is not an integer");
  }
  return number;
}
