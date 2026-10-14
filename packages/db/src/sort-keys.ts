import type { Database } from "bun:sqlite";
import { foldName } from "@num/shared";

/** The tables that have a `sort_key` column: the folded name (`foldName`). */
const sortKeyTables = ["accounts", "buckets", "categories", "category_groups", "merchants", "recurring_plans", "tags"] as const;

/**
 * Migration 0008 adds `sort_key` with an empty value. SQL cannot fold Unicode, thus this step writes the key of each
 * row that has an empty value, with the same function as the app (`foldName`). The step runs in the same start as the
 * migration. Later starts find no row to change, because the app writes the key on each create and rename.
 */
export function fillSortKeys(sqlite: Database) {
  sqlite.transaction(() => {
    for (const table of sortKeyTables) {
      const rows = sqlite.query(`select id, name from ${table} where sort_key = ''`).all() as { id: string; name: string }[];
      const update = sqlite.query(`update ${table} set sort_key = ? where id = ?`);
      for (const row of rows) {
        update.run(foldName(row.name), row.id);
      }
    }
  })();
}
