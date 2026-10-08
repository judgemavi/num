import {
  errorSchema,
  mortgagePrefillQuerySchema,
  mortgagePrefillSchema,
  mortgageTermsSchema,
  mortgageTermsWriteSchema,
  mortgageViewQuerySchema,
  mortgageViewSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { getMortgageTerms, mortgageAccountView, mortgagePrefill, saveMortgageTerms } from "../services/mortgage";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const idParams = z.object({
  id: z.uuid(),
});

const readRoute = createRoute({
  method: "get",
  path: "/api/accounts/{id}/mortgage-terms",
  request: { params: idParams },
  responses: {
    200: {
      description: "Mortgage terms",
      content: { "application/json": { schema: mortgageTermsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/accounts/{id}/mortgage-terms",
  request: {
    params: idParams,
    body: {
      required: true,
      content: { "application/json": { schema: mortgageTermsWriteSchema } },
    },
  },
  responses: {
    200: {
      description: "The saved mortgage terms",
      content: { "application/json": { schema: mortgageTermsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const viewRoute = createRoute({
  method: "get",
  path: "/api/accounts/{id}/mortgage",
  request: {
    params: idParams,
    query: mortgageViewQuerySchema,
  },
  responses: {
    200: {
      description: "Mortgage balance, schedule and payoff",
      content: { "application/json": { schema: mortgageViewSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const prefillRoute = createRoute({
  method: "get",
  path: "/api/mortgage-prefill",
  request: { query: mortgagePrefillQuerySchema },
  responses: {
    200: {
      description: "Principal and interest for a mortgage payment date, or null",
      content: { "application/json": { schema: mortgagePrefillSchema.nullable() } },
    },
    400: errorResponse,
  },
});

export function registerMortgage(app: OpenAPIHono, db: Db) {
  app.openapi(readRoute, (c) => c.json(getMortgageTerms(db, c.req.valid("param").id), 200));
  app.openapi(saveRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(saveMortgageTerms(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
  app.openapi(viewRoute, (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    return c.json(mortgageAccountView(db, id, query.asOf, query.extra), 200);
  });
  app.openapi(prefillRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(mortgagePrefill(db, query.fromAccountId, query.toAccountId, query.date), 200);
  });
}
