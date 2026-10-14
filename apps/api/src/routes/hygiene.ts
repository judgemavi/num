import { asOfQuerySchema, hygieneSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readHygiene } from "../services/hygiene";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const hygieneRoute = createRoute({
  operationId: "get_hygiene",
  description: "Read hygiene checks. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/hygiene",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Hygiene checks for asOf",
      content: { "application/json": { schema: hygieneSchema } },
    },
    400: errorResponse,
  },
});

export function hygieneRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(hygieneRoute, (c) => c.json(readHygiene(db, c.req.valid("query").asOf), 200));
}

export type HygieneRoutes = ReturnType<typeof hygieneRoutes>;
