import { asOfQuerySchema, feasibilitySchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readFeasibility } from "../services/feasibility";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const feasibilityRoute = createRoute({
  operationId: "get_goals_feasibility",
  description: "Read goal feasibility for the month of asOf: the monthly income, the bills and the spending refills, the surplus, what the goals and sinking funds need, the shortfall, and a later date that fits for each one. It is null when the book has no active income. This does not create, change or delete a record.",
  method: "get",
  path: "/api/goals/feasibility",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Goal feasibility",
      content: { "application/json": { schema: feasibilitySchema } },
    },
    400: errorResponse,
  },
});

export function feasibilityRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook }).openapi(feasibilityRoute, (c) => c.json(readFeasibility(db, c.req.valid("query").asOf), 200));
}
