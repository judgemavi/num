import { z } from "zod";
import { currencyCodeSchema } from "./currency";

export const categorySets = ["default", "none"] as const;

export const categorySetSchema = z.enum(categorySets);

export type CategorySet = z.infer<typeof categorySetSchema>;

export const setupStatusSchema = z.object({
  complete: z.boolean(),
});

export const setupRequestSchema = z.object({
  currency: currencyCodeSchema,
  categorySet: categorySetSchema,
});

export const setupResultSchema = setupRequestSchema;

export const currencyUpdateSchema = z.object({
  currency: currencyCodeSchema,
});

export const aiAccessSettingSchema = z.object({
  aiCanWrite: z.boolean(),
});
