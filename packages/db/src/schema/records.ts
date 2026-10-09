import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const monthCloses = sqliteTable("month_closes", {
  month: text("month").primaryKey(),
  closedAt: text("closed_at").notNull(),
});

export const inboxDecisions = sqliteTable("inbox_decisions", {
  itemKey: text("item_key").primaryKey(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  decidedAt: text("decided_at").notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: text("before"),
    after: text("after"),
    source: text("source").notNull(),
    at: text("at").notNull(),
  },
  (table) => [index("audit_log_entity").on(table.entity, table.entityId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
