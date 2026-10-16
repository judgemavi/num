import {
  loanPaymentDefaultsQuerySchema,
  loanPaymentDefaultsSchema,
  mortgageTermsSchema,
  mortgageViewQuerySchema,
  mortgageViewSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { loanPaymentDefaults } from "../services/loan-payment";
import { getMortgageTerms, mortgageAccountView } from "../services/mortgage";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const readRoute = createRoute({
  operationId: "get_accounts_id_mortgage_terms",
  description: "Read accounts. This does not create, change or delete a record.",
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
  description: "Read accounts. This does not create, change or delete a record.",
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

const loanDefaultsRoute = createRoute({
  operationId: "get_loan_payment_defaults",
  description: "Read the start values of a loan payment to a mortgage or loan account on a date: the interest from the payment schedule and the interest category. This does not create, change or delete a record.",
  method: "get",
  path: "/api/loan-payment-defaults",
  request: { query: loanPaymentDefaultsQuerySchema },
  responses: {
    200: {
      description: "Interest and interest category, each null when there is no start value",
      content: { "application/json": { schema: loanPaymentDefaultsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
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
    .openapi(loanDefaultsRoute, (c) => {
      const query = c.req.valid("query");
      return c.json(loanPaymentDefaults(db, query.accountId, query.date), 200);
    });
}
