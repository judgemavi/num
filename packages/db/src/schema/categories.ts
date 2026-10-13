import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categoryGroups = sqliteTable(
  "category_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("category_groups_name_lower_unique").on(sql`lower(${table.name})`)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    groupId: text("group_id").references(() => categoryGroups.id),
    essential: integer("essential", { mode: "boolean" }).notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("categories_name_lower_unique").on(sql`lower(${table.name})`)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("tags_name_lower_unique").on(sql`lower(${table.name})`)],
);

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("merchants_name_lower_unique").on(sql`lower(${table.name})`)],
);
