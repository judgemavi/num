import { z } from "zod";
import { isIsoDate } from "./date";

export const unreadableReasons = [
  "date_unreadable",
  "amount_unreadable",
  "too_many_decimals",
  "amount_too_large",
  "sign_marker",
] as const;

export type UnreadableReason = (typeof unreadableReasons)[number];

export const unreadableRowSchema = z.object({
  line: z.number().int().nonnegative(),
  raw: z.string(),
  reason: z.enum(unreadableReasons),
});

export type UnreadableRow = z.infer<typeof unreadableRowSchema>;

export const signConventions = ["account", "inverted"] as const;

export type SignConvention = (typeof signConventions)[number];

export const dateOrders = ["dmy", "mdy"] as const;

export type DateOrder = (typeof dateOrders)[number];

export const dateFormats = ["iso", "mdy", "dmy"] as const;

export type DateFormat = (typeof dateFormats)[number];

export const decimalSeparators = [".", ","] as const;

export type DecimalSeparator = (typeof decimalSeparators)[number];

const columnSchema = z.number().int().nonnegative();

export const hasHeaderSchema = z.union([z.literal("auto"), z.boolean()]).default("auto");

/** Day, month and year fields in a statement, before the date order is applied. */
export const statementDatePattern = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function statementDate(raw: string, order: DateOrder): string | null {
  const text = raw.trim();
  if (isIsoDate(text)) {
    return text;
  }

  const match = statementDatePattern.exec(text);
  if (!match) {
    return null;
  }

  const yearPart = match[3];
  const firstPart = match[1];
  const secondPart = match[2];
  if (yearPart === undefined || firstPart === undefined || secondPart === undefined) {
    return null;
  }

  let year = Number(yearPart);
  if (year < 100) {
    year += 2000;
  }
  const first = Number(firstPart);
  const second = Number(secondPart);
  const month = order === "mdy" ? first : second;
  const day = order === "mdy" ? second : first;
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

const columnMapFields = {
  hasHeader: hasHeaderSchema,
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
}) {
  return map.amount != null || map.debit != null || map.credit != null;
}

export const columnMapSchema = z.object(columnMapFields).refine(hasAmountColumn);

export type ColumnMap = z.infer<typeof columnMapSchema>;

export const presetSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    dateFormat: z.enum(dateFormats),
    card: columnSchema.optional(),
    ...columnMapFields,
  })
  .refine(hasAmountColumn);

export type Preset = z.infer<typeof presetSchema>;
