import { z } from "zod";

export const sortDirections = ["asc", "desc"] as const;

export function listQuerySchema<const T extends readonly [string, ...string[]]>(columns: T) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    sort: z.enum(columns).optional(),
    dir: z.enum(sortDirections).optional(),
  });
}

export function pagedResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
