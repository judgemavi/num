import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { inboxDecisionCodes } from "@num/shared";
import { auditSources } from "./codes";

export const inboxDecisions = sqliteTable("inbox_decisions", {
  itemKey: text("item_key").primaryKey(),
  decision: text("decision", { enum: inboxDecisionCodes }).notNull(),
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
    source: text("source", { enum: auditSources }).notNull(),
    at: text("at").notNull(),
  },
  (table) => [index("audit_log_entity").on(table.entity, table.entityId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
