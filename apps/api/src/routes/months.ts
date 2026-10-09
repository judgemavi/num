import { asOfQuerySchema, errorSchema, monthDetailSchema, monthKeySchema, monthListSchema } from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { closeMonth, listMonths, readMonth, reopenMonth } from "../services/months";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const monthParams = z.object({
  month: monthKeySchema,
});

const listRoute = createRoute({
  operationId: "get_months",
  description: "Read closed months. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/months",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Months and whether each one is ready to close",
      content: { "application/json": { schema: monthListSchema } },
    },
    400: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_months_month",
  description: "Read closed months. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/months/{month}",
  request: { params: monthParams, query: asOfQuerySchema },
  responses: {
    200: {
      description: "One month, its close status and its story",
      content: { "application/json": { schema: monthDetailSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const closeRoute = createRoute({
  operationId: "post_months_month_close",
  description: "Create or run closed months (close). This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
  method: "post",
  path: "/api/months/{month}/close",
  request: { params: monthParams, query: asOfQuerySchema },
  responses: {
    200: {
      description: "The closed month",
      content: { "application/json": { schema: monthDetailSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const reopenRoute = createRoute({
  operationId: "post_months_month_reopen",
  description: "Create or run closed months (reopen). This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
  method: "post",
  path: "/api/months/{month}/reopen",
  request: { params: monthParams, query: asOfQuerySchema },
  responses: {
    200: {
      description: "The opened month",
      content: { "application/json": { schema: monthDetailSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerMonths(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listMonths(db, c.req.valid("query").asOf), 200));
  app.openapi(readRoute, (c) => {
    const { month } = c.req.valid("param");
    return c.json(readMonth(db, month, c.req.valid("query").asOf), 200);
  });
  app.openapi(closeRoute, (c) => {
    const { month } = c.req.valid("param");
    return c.json(closeMonth(db, month, c.req.valid("query").asOf, { source: "ui" }), 200);
  });
  app.openapi(reopenRoute, (c) => {
    const { month } = c.req.valid("param");
    return c.json(reopenMonth(db, month, c.req.valid("query").asOf, { source: "ui" }), 200);
  });
}
