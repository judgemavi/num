import { insightsQuerySchema, insightsSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readInsights } from "../services/insights";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const insightsRoute = createRoute({
  operationId: "get_insights",
  description: "Read insights. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/insights",
  request: { query: insightsQuerySchema },
  responses: {
    200: {
      description: "Spending by group and category, merchant and tag lists, the timeline (actual and forecast) and net worth",
      content: { "application/json": { schema: insightsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

export function insightsRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(insightsRoute, (c) => c.json(readInsights(db, c.req.valid("query")), 200));
}

export type InsightsRoutes = ReturnType<typeof insightsRoutes>;
