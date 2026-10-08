import {
  asOfQuerySchema,
  errorSchema,
  suggestionQuerySchema,
  suggestionSchema,
  transferHintQuerySchema,
  transferHintSchema,
  transferPairAcceptSchema,
  transferPairListSchema,
  transferPairSchema,
} from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { acceptTransferPair, listTransferPairs, suggestForPayee, transferHint } from "../services/suggestions";

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

const hintRoute = createRoute({
  method: "get",
  path: "/api/transfer-hint",
  request: { query: transferHintQuerySchema },
  responses: {
    200: { description: "An opposite transfer match", content: { "application/json": { schema: transferHintSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

export function registerSuggestions(app: OpenAPIHono, db: Db) {
  app.openapi(hintRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(transferHint(db, { accountId: query.accountId, date: query.date, amount: query.amount }), 200);
  });
  app.openapi(suggestRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(suggestForPayee(db, query.accountId, query.payee), 200);
  });
  app.openapi(transfersRoute, (c) => c.json(listTransferPairs(db, c.req.valid("query").asOf), 200));
  app.openapi(pairRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(acceptTransferPair(db, c.req.valid("query").asOf, body.leftId, body.rightId, { source: "ui" }), 200);
  });
}
