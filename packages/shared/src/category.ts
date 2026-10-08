import { z } from "zod";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";

export const categoryKinds = ["income", "expense"] as const;

export type CategoryKind = (typeof categoryKinds)[number];

const nameSchema = z.string().trim().min(1);

const archivedQuery = {
  archived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
};

export const categoryGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const categoryGroupListSchema = z.object({
  items: z.array(categoryGroupSchema),
});

export const categoryGroupCreateSchema = z.object({
  name: nameSchema,
});

export const categoryGroupUpdateSchema = z.object({
  name: nameSchema,
});

export const categoryGroupOrderSchema = z.object({
  ids: z.array(z.uuid()),
});

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

export const categoryCreateSchema = z
  .object({
    name: nameSchema,
    kind: z.enum(categoryKinds),
    groupId: z.uuid().nullable().optional(),
    essential: z.boolean().optional(),
  })
  .refine((value) => value.kind === "expense" || value.essential !== true, { path: ["essential"] });

export const categoryUpdateSchema = z
  .object({
    name: nameSchema,
    kind: z.enum(categoryKinds),
    groupId: z.uuid().nullable(),
    essential: z.boolean(),
  })
  .refine((value) => value.kind === "expense" || value.essential !== true, { path: ["essential"] });

export const categoryListQuerySchema = listQuerySchema(["name", "kind"]).extend(archivedQuery);

export const categoryListSchema = pagedResponseSchema(categorySchema);

export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const tagCreateSchema = z.object({
  name: nameSchema,
});

export const tagUpdateSchema = z.object({
  name: nameSchema,
});

export const tagListQuerySchema = listQuerySchema(["name"]).extend(archivedQuery);

export const tagListSchema = pagedResponseSchema(tagSchema);

export type CategoryGroup = z.infer<typeof categoryGroupSchema>;
export type CategoryGroupCreate = z.infer<typeof categoryGroupCreateSchema>;
export type CategoryGroupUpdate = z.infer<typeof categoryGroupUpdateSchema>;
export type CategoryGroupOrder = z.infer<typeof categoryGroupOrderSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryListQuery = z.output<typeof categoryListQuerySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type TagCreate = z.infer<typeof tagCreateSchema>;
export type TagUpdate = z.infer<typeof tagUpdateSchema>;
export type TagListQuery = z.output<typeof tagListQuerySchema>;
