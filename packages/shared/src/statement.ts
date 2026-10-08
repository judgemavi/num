import { z } from "zod";

export const signConventions = ["account", "inverted"] as const;

export type SignConvention = (typeof signConventions)[number];

export const dateOrders = ["dmy", "mdy"] as const;

export type DateOrder = (typeof dateOrders)[number];

export const decimalSeparators = [".", ","] as const;

export type DecimalSeparator = (typeof decimalSeparators)[number];

const columnSchema = z.number().int().nonnegative();

const columnMapFields = {
  hasHeader: z.boolean(),
  date: columnSchema,
  description: columnSchema,
  amount: columnSchema.nullable().optional(),
  debit: columnSchema.nullable().optional(),
  credit: columnSchema.nullable().optional(),
  balance: columnSchema.nullable().optional(),
  bankId: columnSchema.nullable().optional(),
  dateOrder: z.enum(dateOrders),
  signConvention: z.enum(signConventions),
  balanceSign: z.enum(signConventions).optional(),
  decimalSeparator: z.enum(decimalSeparators).optional(),
};

function hasAmountColumn(map: {
  amount?: number | null;
  debit?: number | null;
  credit?: number | null;
}): boolean {
  return map.amount != null || map.debit != null || map.credit != null;
}

export const columnMapSchema = z.object(columnMapFields).refine(hasAmountColumn);

export type ColumnMap = z.infer<typeof columnMapSchema>;

export const presetSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    ...columnMapFields,
  })
  .refine(hasAmountColumn);

export type Preset = z.infer<typeof presetSchema>;
