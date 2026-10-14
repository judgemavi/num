import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { importStatement } from "./imports";

export const at = "2026-10-07T16:00:00Z";

export const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

export function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-import-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, {
    name: "Everyday",
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 0,
    source: "ui",
    at,
  });
  return {
    dir,
    db,
    sqlite,
    account,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function csv(lines: string[], balance = false): Uint8Array {
  const header = balance ? "date,description,amount,balance" : "date,description,amount";
  return new TextEncoder().encode([header, ...lines].join("\n") + "\n");
}

export function importCsv(
  db: Db,
  dir: string,
  accountId: string,
  filename: string,
  lines: string[],
  columnMap: ColumnMap | null = map,
) {
  return importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: csv(lines),
    columnMap,
  });
}

export function activeCount(db: Db): number {
  return db.select({ id: transactions.id }).from(transactions).all().length;
}
