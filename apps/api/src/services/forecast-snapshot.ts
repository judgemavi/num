import { auditLog, forecastSnapshots, monthCloses } from "@num/db";
import { Temporal, utcNow } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import type { AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function currentForecastMonth(db: Db): string | null {
  const closed = db
    .select()
    .from(monthCloses)
    .all()
    .filter((row) => row.reopenedAt === null)
    .map((row) => row.month)
    .sort();
  const latest = closed[closed.length - 1];
  if (!latest) {
    return null;
  }
  return Temporal.PlainDate.from(`${latest}-01`).add({ months: 1 }).toString().slice(0, 7);
}

export function storeForecastSnapshot(db: Db, asOf: string, predictedTotal: number, input: WriteInput) {
  const month = asOf.slice(0, 7);
  const current = currentForecastMonth(db);
  if (current !== null && current !== month) {
    return;
  }
  if (db.select().from(forecastSnapshots).where(eq(forecastSnapshots.month, month)).get()) {
    return;
  }
  const at = input.at ?? utcNow();
  const row = { month, asOf, predictedTotal, createdAt: at };
  db.transaction((tx) => {
    tx.insert(forecastSnapshots).values(row).onConflictDoNothing().run();
    const changed = tx.get<{ changes: number }>(sql`select changes() as changes`);
    if (!changed || changed.changes === 0) {
      return;
    }
    tx.insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        entity: "forecast_snapshot",
        entityId: month,
        action: "create",
        before: null,
        after: JSON.stringify(row),
        source: input.source,
        at,
      })
      .run();
  });
}
