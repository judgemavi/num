import { z } from "zod";
import { archivedQuery, listQuerySchema, pagedResponseSchema, queryIdOrNone } from "./list";
import { isUtcTimestamp } from "./time";

export const categoryKinds = ["income", "expense"] as const;

export type CategoryKind = (typeof categoryKinds)[number];

const nameSchema = z.string().trim().min(1);

export const categoryGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const categoryGroupListSchema = z.object({
  items: z.array(categoryGroupSchema),
});

export const categoryGroupCreateSchema = z.object({
  name: nameSchema,
});

export const categoryGroupUpdateSchema = categoryGroupCreateSchema.partial();

export const categoryGroupDeleteSchema = z.object({
  ok: z.literal(true),
});

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(categoryKinds),
  groupId: z.uuid().nullable(),
  essential: z.boolean(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

const categoryFields = z.object({
  name: nameSchema,
  kind: z.enum(categoryKinds),
  groupId: z.uuid().nullable().optional(),
  essential: z.boolean().optional(),
});

export const categoryCreateSchema = categoryFields.refine((value) => value.kind === "expense" || value.essential !== true, {
  path: ["essential"],
});

/** A PATCH body: only the fields that change. The API checks the fields together on the stored category with the patch. */
export const categoryUpdateSchema = categoryFields.partial();

export const categoryListQuerySchema = listQuerySchema(["name", "kind"]).extend({
  ...archivedQuery,
  groupId: queryIdOrNone,
});

export const categoryListSchema = pagedResponseSchema(categorySchema);

export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const tagCreateSchema = z.object({
  name: nameSchema,
});

export const tagUpdateSchema = tagCreateSchema.partial();

export const tagListQuerySchema = listQuerySchema(["name"]).extend(archivedQuery);

export const tagListSchema = pagedResponseSchema(tagSchema);

export type CategoryGroup = z.infer<typeof categoryGroupSchema>;
export type CategoryGroupCreate = z.infer<typeof categoryGroupCreateSchema>;
export type CategoryGroupUpdate = z.infer<typeof categoryGroupUpdateSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryListQuery = z.output<typeof categoryListQuerySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type TagCreate = z.infer<typeof tagCreateSchema>;
export type TagUpdate = z.infer<typeof tagUpdateSchema>;
export type TagListQuery = z.output<typeof tagListQuerySchema>;
