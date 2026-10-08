import { errorSchema, insightsQuerySchema, insightsSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readInsights } from "../services/insights";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const insightsRoute = createRoute({
  method: "get",
  path: "/api/insights",
  request: { query: insightsQuerySchema },
  responses: {
    200: {
      description: "Spending, the 12-month trend and net worth",
      content: { "application/json": { schema: insightsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

export function registerInsights(app: OpenAPIHono, db: Db) {
  app.openapi(insightsRoute, (c) => c.json(readInsights(db, c.req.valid("query")), 200));
}
