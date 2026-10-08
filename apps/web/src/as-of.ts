import { Temporal } from "@num/shared";

export function localAsOf(): string {
  return Temporal.Now.plainDateISO().toString();
}
