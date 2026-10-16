import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { categoryKinds, identityColors } from "@num/shared";

export const categoryGroups = sqliteTable(
  "category_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color", { enum: identityColors }).notNull(),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [
    uniqueIndex("category_groups_name_lower_unique").on(sql`lower(${table.name})`),
    index("category_groups_sort_key_idx").on(table.sortKey, table.name, table.id),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: categoryKinds }).notNull(),
    groupId: text("group_id").references(() => categoryGroups.id),
    archivedAt: text("archived_at"),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [
    uniqueIndex("categories_name_lower_unique").on(sql`lower(${table.name})`),
    index("categories_sort_key_idx").on(table.sortKey, table.name, table.id),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    archivedAt: text("archived_at"),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [
    uniqueIndex("tags_name_lower_unique").on(sql`lower(${table.name})`),
    index("tags_sort_key_idx").on(table.sortKey, table.name, table.id),
  ],
);

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    archivedAt: text("archived_at"),
    /** The folded name (`foldName`). The list sorts by it. */
    sortKey: text("sort_key").notNull(),
  },
  (table) => [
    uniqueIndex("merchants_name_lower_unique").on(sql`lower(${table.name})`),
    index("merchants_sort_key_idx").on(table.sortKey, table.name, table.id),
  ],
);
export type MerchantRow = typeof merchants.$inferSelect;
