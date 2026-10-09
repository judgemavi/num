import { asOfQuerySchema, errorSchema, forecastSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readForecast, readForecastOnly } from "../services/forecast";
import { isMcpRead } from "../services/work";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const forecastRoute = createRoute({
  operationId: "get_forecast",
  description: "Read the 90-day forecast, including safe to spend. This does not store the month snapshot and it does not change a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/forecast",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Daily forecast for 90 days",
      content: { "application/json": { schema: forecastSchema } },
    },
    400: errorResponse,
  },
});

export function registerForecast(app: OpenAPIHono, db: Db) {
  app.openapi(forecastRoute, (c) => {
    const asOf = c.req.valid("query").asOf;
    if (isMcpRead()) {
      return c.json(readForecastOnly(db, asOf), 200);
    }
    return c.json(readForecast(db, asOf, { source: "ui" }), 200);
  });
}
