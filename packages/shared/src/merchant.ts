import { z } from "zod";
import { archivedQuery, listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";

const nameSchema = z.string().trim().min(1);

export const merchantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const merchantCreateSchema = z.object({
  name: nameSchema,
});

export const merchantUpdateSchema = z.object({
  name: nameSchema,
});

export const merchantMergeSchema = z.object({
  targetId: z.uuid(),
});

export const merchantListQuerySchema = listQuerySchema(["name"]).extend(archivedQuery);
export const merchantListSchema = pagedResponseSchema(merchantSchema);

export type Merchant = z.infer<typeof merchantSchema>;
export type MerchantCreate = z.infer<typeof merchantCreateSchema>;
export type MerchantUpdate = z.infer<typeof merchantUpdateSchema>;
export type MerchantListQuery = z.output<typeof merchantListQuerySchema>;
