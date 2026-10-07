import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { categoryKinds } from "./codes";
import { oneOf } from "./sql";

export const categoryGroups = sqliteTable("category_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

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
  (table) => [
    check("categories_kind", oneOf(table.kind, categoryKinds)),
    check("categories_essential", sql`${table.kind} = 'expense' or ${table.essential} = 0`),
    uniqueIndex("categories_name_lower_unique").on(sql`lower(${table.name})`),
  ],
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
    defaultCategoryId: text("default_category_id").references(() => categories.id),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("merchants_name_lower_unique").on(sql`lower(${table.name})`)],
);
