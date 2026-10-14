import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bucketColors, bucketEventKinds, bucketIcons, bucketKinds, sinkingRepeats } from "@num/shared";
import { categories } from "./categories";
import { transactions } from "./ledger";

export const buckets = sqliteTable(
  "buckets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: bucketKinds }).notNull(),
    priority: integer("priority").notNull(),
    essential: integer("essential", { mode: "boolean" }).notNull(),
    color: text("color", { enum: bucketColors }).notNull(),
    icon: text("icon", { enum: bucketIcons }).notNull(),
    startDate: text("start_date").notNull(),
    archivedAt: text("archived_at"),
    refillTo: integer("refill_to"),
    amount: integer("amount"),
    dueDate: text("due_date"),
    repeat: text("repeat", { enum: sinkingRepeats }),
    target: integer("target"),
    targetDate: text("target_date"),
    fixedAmount: integer("fixed_amount"),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [index("buckets_sort_key_idx").on(table.sortKey, table.name, table.id)],
);
export type BucketRow = typeof buckets.$inferSelect;

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
    uniqueIndex("funding_runs_income_active")
      .on(table.incomeTransactionId)
      .where(sql`${table.undoneAt} is null`),
  ],
);
export type FundingRunRow = typeof fundingRuns.$inferSelect;

export const bucketEvents = sqliteTable(
  "bucket_events",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: bucketEventKinds }).notNull(),
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
  (table) => [index("bucket_events_bucket").on(table.bucketId)],
);
export type BucketEventRow = typeof bucketEvents.$inferSelect;
