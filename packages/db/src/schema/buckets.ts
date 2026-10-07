import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { categories } from "./categories";
import { bucketEventKinds, bucketKinds, sinkingRepeats } from "./codes";
import { transactions } from "./ledger";
import { isoDate, nullOrIsoDate, nullOrOneOf, oneOf } from "./sql";

export const buckets = sqliteTable(
  "buckets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    priority: integer("priority").notNull(),
    essential: integer("essential", { mode: "boolean" }).notNull(),
    archivedAt: text("archived_at"),
    refillTo: integer("refill_to"),
    amount: integer("amount"),
    dueDate: text("due_date"),
    repeat: text("repeat"),
    target: integer("target"),
    targetDate: text("target_date"),
    // The amount for each paycheck when a goal has no target date.
    fixedAmount: integer("fixed_amount"),
  },
  (table) => [
    check("buckets_kind", oneOf(table.kind, bucketKinds)),
    check("buckets_repeat", nullOrOneOf(table.repeat, sinkingRepeats)),
    check("buckets_due_date", nullOrIsoDate(table.dueDate)),
    check("buckets_target_date", nullOrIsoDate(table.targetDate)),
    check(
      "buckets_amounts",
      sql`(
        (${table.refillTo} is null or ${table.refillTo} >= 0)
        and (${table.amount} is null or ${table.amount} >= 0)
        and (${table.target} is null or ${table.target} >= 0)
        and (${table.fixedAmount} is null or ${table.fixedAmount} >= 0)
      )`,
    ),
    check(
      "buckets_kind_fields",
      sql`(
        ${table.kind} = 'spending'
        and ${table.refillTo} is not null
        and ${table.amount} is null
        and ${table.dueDate} is null
        and ${table.repeat} is null
        and ${table.target} is null
        and ${table.targetDate} is null
        and ${table.fixedAmount} is null
      ) or (
        ${table.kind} = 'sinking'
        and ${table.amount} is not null
        and ${table.dueDate} is not null
        and ${table.repeat} is not null
        and ${table.refillTo} is null
        and ${table.target} is null
        and ${table.targetDate} is null
        and ${table.fixedAmount} is null
      ) or (
        ${table.kind} = 'goal'
        and ${table.target} is not null
        and ${table.refillTo} is null
        and ${table.amount} is null
        and ${table.dueDate} is null
        and ${table.repeat} is null
        and (
          (${table.targetDate} is not null and ${table.fixedAmount} is null)
          or (${table.targetDate} is null and ${table.fixedAmount} is not null)
        )
      )`,
    ),
  ],
);

export const bucketCategories = sqliteTable("bucket_categories", {
  categoryId: text("category_id")
    .primaryKey()
    .references(() => categories.id),
  bucketId: text("bucket_id")
    .notNull()
    .references(() => buckets.id),
});

export const fundingRuns = sqliteTable(
  "funding_runs",
  {
    id: text("id").primaryKey(),
    incomeTransactionId: text("income_transaction_id")
      .notNull()
      .references(() => transactions.id),
    date: text("date").notNull(),
    createdAt: text("created_at").notNull(),
    undoneAt: text("undone_at"),
  },
  (table) => [
    check("funding_runs_date", isoDate(table.date)),
    uniqueIndex("funding_runs_income_active")
      .on(table.incomeTransactionId)
      .where(sql`${table.undoneAt} is null`),
  ],
);

export const bucketEvents = sqliteTable(
  "bucket_events",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => buckets.id),
    otherBucketId: text("other_bucket_id").references(() => buckets.id),
    amount: integer("amount").notNull(),
    date: text("date").notNull(),
    note: text("note"),
    fundingRunId: text("funding_run_id").references(() => fundingRuns.id),
    undoneAt: text("undone_at"),
  },
  (table) => [
    check("bucket_events_kind", oneOf(table.kind, bucketEventKinds)),
    check("bucket_events_amount", sql`${table.amount} > 0`),
    check("bucket_events_date", isoDate(table.date)),
    check(
      "bucket_events_move",
      sql`(
        ${table.kind} = 'move'
        and ${table.otherBucketId} is not null
        and ${table.otherBucketId} <> ${table.bucketId}
      ) or (
        ${table.kind} <> 'move'
        and ${table.otherBucketId} is null
      )`,
    ),
    index("bucket_events_bucket").on(table.bucketId),
  ],
);
