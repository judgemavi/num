import { asOfQuerySchema, forecastSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readForecast } from "../services/forecast";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const forecastRoute = createRoute({
  operationId: "get_forecast",
  description: "Read the 90-day forecast, including safe to spend. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

export function forecastRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(forecastRoute, (c) => {
      const asOf = c.req.valid("query").asOf;
      return c.json(readForecast(db, asOf), 200);
    });
}

export type ForecastRoutes = ReturnType<typeof forecastRoutes>;
