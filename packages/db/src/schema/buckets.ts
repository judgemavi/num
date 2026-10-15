import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bucketColors, bucketEventKinds, bucketIcons, bucketKinds, sinkingRepeats } from "@num/shared";
import { categories } from "./categories";

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
    months: integer("months"),
    fillMonths: integer("fill_months"),
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

/** A month whose funding the user undid. The fill does not pay a held month (decision 0059). */
export const monthHolds = sqliteTable("month_holds", {
  month: text("month").primaryKey(),
  createdAt: text("created_at").notNull(),
});

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
    /** The month (YYYY-MM) that the fill paid. Null for an event of the user. */
    month: text("month"),
    undoneAt: text("undone_at"),
  },
  (table) => [index("bucket_events_bucket").on(table.bucketId)],
);
export type BucketEventRow = typeof bucketEvents.$inferSelect;
