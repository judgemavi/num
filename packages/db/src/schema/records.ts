import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { auditSources, inboxDecisionCodes, proposalStatuses, settingKeys } from "./codes";
import { isoDate, oneOf } from "./sql";

export const monthCloses = sqliteTable(
  "month_closes",
  {
    month: text("month").primaryKey(),
    closedAt: text("closed_at").notNull(),
    reopenedAt: text("reopened_at"),
    reopenReason: text("reopen_reason"),
    summaryJson: text("summary_json").notNull(),
  },
  (table) => [
    check("month_closes_month", sql`${table.month} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]'`),
    check("month_closes_summary_json", sql`json_valid(${table.summaryJson})`),
    check(
      "month_closes_reopen",
      sql`(
        ${table.reopenedAt} is null and ${table.reopenReason} is null
      ) or (
        ${table.reopenedAt} is not null and ${table.reopenReason} is not null
      )`,
    ),
  ],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    resultRef: text("result_ref"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (table) => [
    check("proposals_status", oneOf(table.status, proposalStatuses)),
    check("proposals_payload_json", sql`json_valid(${table.payloadJson})`),
    check(
      "proposals_decided_at",
      sql`(
        ${table.status} = 'pending' and ${table.decidedAt} is null
      ) or (
        ${table.status} <> 'pending' and ${table.decidedAt} is not null
      )`,
    ),
  ],
);

export const inboxDecisions = sqliteTable(
  "inbox_decisions",
  {
    itemKey: text("item_key").primaryKey(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [check("inbox_decisions_decision", oneOf(table.decision, inboxDecisionCodes))],
);

export const forecastSnapshots = sqliteTable(
  "forecast_snapshots",
  {
    month: text("month").primaryKey(),
    asOf: text("as_of").notNull(),
    predictedTotal: integer("predicted_total").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("forecast_snapshots_month", sql`${table.month} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]'`),
    check("forecast_snapshots_as_of", isoDate(table.asOf)),
  ],
);

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
  (table) => [
    check("audit_log_source", oneOf(table.source, auditSources)),
    check(
      "audit_log_json",
      sql`(
        ${table.before} is null or json_valid(${table.before})
      ) and (
        ${table.after} is null or json_valid(${table.after})
      )`,
    ),
    index("audit_log_entity").on(table.entity, table.entityId),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (table) => [check("settings_key", oneOf(table.key, settingKeys))],
);
