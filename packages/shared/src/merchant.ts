import { z } from "zod";
import { listQuerySchema, pagedResponseSchema } from "./list";

export const merchantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const merchantListQuerySchema = listQuerySchema(["name"]);

export const merchantListSchema = pagedResponseSchema(merchantSchema);

export type Merchant = z.infer<typeof merchantSchema>;
export type MerchantListQuery = z.output<typeof merchantListQuerySchema>;
