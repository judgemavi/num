import type { AccountRow } from "@num/db";
import { withoutId } from "./write";

/** The audit log keeps the column map as JSON text, the same text that the column stores. */
export function accountAuditSnapshot(row: AccountRow) {
  return { ...withoutId(row), columnMap: row.columnMap && JSON.stringify(row.columnMap) };
}
