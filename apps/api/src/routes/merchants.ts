import { errorSchema, merchantListQuerySchema, merchantListSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { listMerchants } from "../services/merchants";

const listRoute = createRoute({
  method: "get",
  path: "/api/merchants",
  request: {
    query: merchantListQuerySchema,
  },
  responses: {
    200: {
      description: "Merchants",
      content: {
        "application/json": {
          schema: merchantListSchema,
        },
      },
    },
    400: {
      description: "The request is not valid",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

export function registerMerchants(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listMerchants(db, c.req.valid("query")), 200));
}
