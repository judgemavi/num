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

/** The most rows on one page of a list. Approve and bulk edit also take one page at most (decision 0051). */
export const maxPageSize = 200;

export function listQuerySchema<const T extends readonly [string, ...string[]]>(columns: T) {
  return z.object({
    page: queryNumber().min(1).default(1),
    pageSize: queryNumber().min(1).max(maxPageSize).default(50),
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

/**
 * The input with no value for each key that `schema` reports in its issues. The key stays, with `undefined`: the
 * router merges the search of a page with the search of the root, thus a key that is not there keeps the value of the URL.
 */
function validSearch(schema: z.ZodType, raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  let search: Record<string, unknown> = { ...raw };
  for (;;) {
    const result = schema.safeParse(search);
    if (result.success) {
      return search;
    }
    const keys = new Set(result.error.issues.map((issue) => issue.path[0]).filter((key) => typeof key === "string" && search[key] !== undefined));
    if (keys.size === 0) {
      // The issues are not on one value of the URL. The search starts with no values.
      return Object.fromEntries(Object.keys(search).map((key) => [key, undefined]));
    }
    search = Object.fromEntries(Object.entries(search).map(([key, value]) => [key, keys.has(key) ? undefined : value]));
  }
}

/**
 * The search schema of a page of the web app. A value in the URL that is not valid goes back to its default: the
 * schema reads the URL without it. The API uses the query schema itself, thus it answers 400 to a value that is not
 * valid (decision 0004).
 */
export function searchWithDefaults<T extends z.ZodType>(schema: T) {
  return z.preprocess((raw: z.input<T>) => validSearch(schema, raw), schema);
}
