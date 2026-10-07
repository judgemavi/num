import type { ErrorBody } from "@num/shared";
import type { Context, ValidationTargets } from "hono";
import type { ZodError } from "zod";

type Target = keyof ValidationTargets;
type Query = Record<string, string | undefined>;

function fieldParams(error: ZodError): Record<string, string> {
  const field = error.issues[0]?.path[0];
  if (typeof field !== "string" || field.length === 0) {
    return {};
  }
  return { field };
}

function queryError(error: ZodError, query: Query): ErrorBody {
  const field = error.issues[0]?.path[0];
  if (field === "asOf") {
    const asOf = query.asOf;
    if (asOf === undefined) {
      return { code: "as_of_required", params: {} };
    }
    return { code: "as_of_invalid", params: { asOf } };
  }
  if (field === "sort") {
    return { code: "sort_unknown", params: { sort: query.sort ?? "" } };
  }
  return { code: "invalid_query", params: fieldParams(error) };
}

export function validationError(error: ZodError, target: Target, query: Query): ErrorBody {
  switch (target) {
    case "query":
      return queryError(error, query);
    case "json":
    case "form":
      return { code: "invalid_body", params: fieldParams(error) };
    case "param":
    case "header":
    case "cookie":
      return { code: "invalid_params", params: fieldParams(error) };
  }
}

export function validationHook(
  result:
    | { success: true; data: unknown; target: Target }
    | { success: false; error: ZodError; target: Target },
  c: Context,
) {
  if (result.success) {
    return;
  }
  return c.json(validationError(result.error, result.target, c.req.query()), 400);
}
