import { z } from "zod";
import { isoDateSchema } from "./date";

export const sortDirections = ["asc", "desc"] as const;

/**
 * An optional query value. A value with only spaces is the same as no value. Then `schema` checks the value.
 * The input type is the input of `schema` or an empty text.
 */
export function optionalQuery<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value: z.input<T> | "" | undefined) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

export const queryText = optionalQuery(z.string().trim().min(1));
export const queryId = optionalQuery(z.uuid());
export const queryIdOrNone = optionalQuery(z.union([z.uuid(), z.literal("none")]));
export const queryDate = optionalQuery(isoDateSchema);

/** A number in a query. The URL and the web app give a number, the query string of a request gives a text. */
export function queryNumber() {
  return z.coerce.number<string | number>().int();
}

export const queryFlag = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((value) => value === true || value === "true");

export const archivedQuery = { archived: queryFlag };

export function listQuerySchema<const T extends readonly [string, ...string[]]>(columns: T) {
  return z.object({
    page: queryNumber().min(1).default(1),
    pageSize: queryNumber().min(1).max(200).default(50),
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
