import { monthPlanQuerySchema, monthPlanSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readMonthPlan } from "../services/month-plan";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const monthPlanRoute = createRoute({
  operationId: "get_plan",
  description: "Read the month plan. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
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

export function planRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(monthPlanRoute, (c) => {
      const query = c.req.valid("query");
      return c.json(readMonthPlan(db, query.asOf, query.month), 200);
    });
}

export type PlanRoutes = ReturnType<typeof planRoutes>;
