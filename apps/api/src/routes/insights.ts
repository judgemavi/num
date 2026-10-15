import { insightsQuerySchema, insightsSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readInsights } from "../services/insights";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const insightsRoute = createRoute({
  operationId: "get_insights",
  description: "Read the spending report of a period (Home \"Spending\"): the income, the spending, the savings and the savings rate; the spending of each group and its categories; and the timeline: the income and spending of each month, the daily total balance of the on-budget accounts and, for a period that ends on asOf, the 90-day forecast. With a category, the timeline shows only the spending of that category. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/insights",
  request: { query: insightsQuerySchema },
  responses: {
    200: {
      description: "The totals, the savings rate, the groups and categories, and the timeline of the period",
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
