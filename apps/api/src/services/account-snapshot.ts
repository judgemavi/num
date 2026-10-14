import type { AccountRow } from "@num/db";
import { withoutSortKey } from "./list-sql";
import { withoutId } from "./write";

/** The audit log keeps the column map as JSON text, the same text that the column stores. */
export function accountAuditSnapshot(row: AccountRow) {
  const { createdAt, ...rest } = withoutSortKey(withoutId(row));
  return { ...rest, columnMap: row.columnMap && JSON.stringify(row.columnMap) };
}
