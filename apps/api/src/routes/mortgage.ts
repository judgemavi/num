import {
  errorSchema,
  mortgagePrefillQuerySchema,
  mortgagePrefillSchema,
  mortgageTermsSchema,
  mortgageViewQuerySchema,
  mortgageViewSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { getMortgageTerms, mortgageAccountView, mortgagePrefill } from "../services/mortgage";
import { validationHook } from "../validation";

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
  operationId: "get_accounts_id_mortgage_terms",
  description: "Read accounts. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
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

const viewRoute = createRoute({
  operationId: "get_accounts_id_mortgage",
  description: "Read accounts. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "get_mortgage_prefill",
  description: "Read mortgage prefill. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
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

export function mortgageRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(readRoute, (c) => c.json(getMortgageTerms(db, c.req.valid("param").id), 200))
    .openapi(viewRoute, (c) => {
      const { id } = c.req.valid("param");
      const query = c.req.valid("query");
      return c.json(
        mortgageAccountView(db, id, query.asOf, { extra: query.extra, lumpSum: query.lumpSum, lumpDate: query.lumpDate }),
        200,
      );
    })
    .openapi(prefillRoute, (c) => {
      const query = c.req.valid("query");
      return c.json(mortgagePrefill(db, query.fromAccountId, query.toAccountId, query.date), 200);
    });
}

export type MortgageRoutes = ReturnType<typeof mortgageRoutes>;
