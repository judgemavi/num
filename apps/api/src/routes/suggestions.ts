import {
  asOfQuerySchema,
  errorSchema,
  promotionAcceptSchema,
  promotionListSchema,
  ruleSchema,
  suggestionQuerySchema,
  suggestionSchema,
  transferPairAcceptSchema,
  transferPairListSchema,
  transferPairSchema,
} from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { acceptTransferPair, listPromotionCandidates, listTransferPairs, promotePayee, suggestForPayee } from "../services/suggestions";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const suggestRoute = createRoute({
  method: "get",
  path: "/api/suggestions",
  request: { query: suggestionQuerySchema },
  responses: {
    200: { description: "A merchant and category suggestion", content: { "application/json": { schema: suggestionSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const promotionsRoute = createRoute({
  method: "get",
  path: "/api/promotions",
  responses: {
    200: { description: "Payees ready to become rules", content: { "application/json": { schema: promotionListSchema } } },
  },
});

const acceptRoute = createRoute({
  method: "post",
  path: "/api/promotions",
  request: { body: { required: true, content: { "application/json": { schema: promotionAcceptSchema } } } },
  responses: {
    200: { description: "The promoted rule", content: { "application/json": { schema: ruleSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const transfersRoute = createRoute({
  method: "get",
  path: "/api/transfer-pairs",
  request: { query: asOfQuerySchema },
  responses: {
    200: { description: "Possible transfer pairs", content: { "application/json": { schema: transferPairListSchema } } },
    400: errorResponse,
  },
});

const pairRoute = createRoute({
  method: "post",
  path: "/api/transfer-pairs",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: transferPairAcceptSchema } } },
  },
  responses: {
    200: { description: "The linked transfer", content: { "application/json": { schema: transferPairSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerSuggestions(app: OpenAPIHono, db: Db) {
  app.openapi(suggestRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(suggestForPayee(db, query.accountId, query.payee), 200);
  });
  app.openapi(promotionsRoute, (c) => c.json(listPromotionCandidates(db), 200));
  app.openapi(acceptRoute, (c) => c.json(promotePayee(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(transfersRoute, (c) => c.json(listTransferPairs(db, c.req.valid("query").asOf), 200));
  app.openapi(pairRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(acceptTransferPair(db, c.req.valid("query").asOf, body.leftId, body.rightId, { source: "ui" }), 200);
  });
}
