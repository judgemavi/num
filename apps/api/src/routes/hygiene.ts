import { asOfQuerySchema, errorSchema, hygieneSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readHygiene } from "../services/hygiene";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const hygieneRoute = createRoute({
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

export function registerHygiene(app: OpenAPIHono, db: Db) {
  app.openapi(hygieneRoute, (c) => c.json(readHygiene(db, c.req.valid("query").asOf), 200));
}
