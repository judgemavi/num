import { insightsQuerySchema, insightsSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readInsights } from "../services/insights";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const insightsRoute = createRoute({
  operationId: "get_insights",
  description: "Read the spending report of a period (Home \"Spending\"): the income, the spending, the savings and the savings rate; the colour and spending of each group and its categories, with the three largest increases (delta and median) on category rows only for This month with no tag; and the timeline: the income and spending of each month, the daily total balance of the on-budget accounts and, for a period that ends on asOf, the 90-day forecast. With a category, the timeline shows only the spending of that category. With a tagId, the spending totals use only the spending lines that have that tag (a line with more than one tag counts in full for each tag); income, savings and the savings rate are null, and the timeline shows only spending, with no forecast. This does not create, change or delete a record.",
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
