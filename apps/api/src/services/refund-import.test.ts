import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { importStatement } from "./imports";
import { createTransaction } from "./transactions";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };

test("an imported refund that comes before its purchase in the file is linked", () => {
  const dir = mkdtempSync(join(tmpdir(), "num-refund-import-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  try {
    db.insert(settings).values({ key: "currency", value: "USD" }).run();
    const account = createAccount(db, { name: "Everyday", kind: "chequing", openingDate: "2025-01-01", openingBalance: 0, ...saved });
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    for (const [date, amount] of [["2025-05-01", -400], ["2025-05-02", 400]] as const) {
      createTransaction(db, {
        accountId: account.id,
        date,
        amount,
        payeeRaw: "NORTH CAFE",
        status: "cleared",
        lines: [{ amount, categoryId: food.id }],
        ...saved,
      });
    }
    const result = importStatement(db, dir, {
      source: "import",
      at,
      asOf: "2026-03-20",
      accountId: account.id,
      filename: "march.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n03/10/2026,NORTH CAFE,4.00\n03/05/2026,NORTH CAFE,-4.00"),
      columnMap: columnMapSchema.parse({
        hasHeader: true,
        date: 0,
        description: 1,
        amount: 2,
        dateOrder: "mdy",
        signConvention: "account",
        decimalSeparator: ".",
      }),
    });
    expect(result.kind).toBe("batch");
    const rows = db.select().from(transactions).all();
    const purchase = rows.find((row) => row.date === "2026-03-05");
    const refund = rows.find((row) => row.date === "2026-03-10");
    expect(refund?.refundOfId).toBe(purchase?.id ?? "missing");
    expect(refund?.autoReason).toBe("refund_match");
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
