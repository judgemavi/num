import { migrateDatabase, openDatabase } from "@num/db";
import { normalizePayee } from "@num/shared";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun apps/api/scripts/backfill-payee-normalized.ts <sqlite-path>");
  process.exit(1);
}

const sqlite = openDatabase(path);
migrateDatabase(sqlite);
const rows = sqlite.query("select id, payee_raw from transactions").all() as { id: string; payee_raw: string }[];
const update = sqlite.prepare("update transactions set payee_normalized = ? where id = ?");
sqlite.exec("begin");
for (const row of rows) {
  update.run(normalizePayee(row.payee_raw), row.id);
}
sqlite.exec("commit");
console.log(`Updated ${rows.length} transactions.`);
sqlite.close();
