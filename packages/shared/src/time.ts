import { Temporal } from "temporal-polyfill";

export function isUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    return false;
  }
  try {
    Temporal.Instant.from(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export function utcNow(): string {
  return Temporal.Now.instant().toString();
}
