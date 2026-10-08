import { errorSchema, monthPlanQuerySchema, monthPlanSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readMonthPlan } from "../services/month-plan";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const monthPlanRoute = createRoute({
  method: "get",
  path: "/api/plan",
  request: { query: monthPlanQuerySchema },
  responses: {
    200: {
      description: "Monthly plan and goal feasibility",
      content: { "application/json": { schema: monthPlanSchema } },
    },
    400: errorResponse,
  },
});

export function registerPlan(app: OpenAPIHono, db: Db) {
  app.openapi(monthPlanRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(readMonthPlan(db, query.asOf, query.month), 200);
  });
}
