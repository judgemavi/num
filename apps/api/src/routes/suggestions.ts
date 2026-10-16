import {
  asOfQuerySchema,
  suggestionQuerySchema,
  suggestionSchema,
  transferHintQuerySchema,
  transferHintSchema,
  transferPairAcceptSchema,
  transferPairSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { acceptTransferPair, suggestForPayee, transferHint } from "../services/suggestions";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const suggestRoute = createRoute({
  operationId: "get_suggestions",
  description: "Read category suggestions. This does not create, change or delete a record.",
  method: "get",
  path: "/api/suggestions",
  request: { query: suggestionQuerySchema },
  responses: {
    200: { description: "A merchant and category suggestion", content: { "application/json": { schema: suggestionSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const pairRoute = createRoute({
  operationId: "post_transfer_pairs",
  description: "Create or run transfer pairs. This does not change records outside this action.",
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
  operationId: "get_transfer_hint",
  description: "Read the transfer hint. This does not create, change or delete a record.",
  method: "get",
  path: "/api/transfer-hint",
  request: { query: transferHintQuerySchema },
  responses: {
    200: { description: "An opposite transfer match", content: { "application/json": { schema: transferHintSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

export function suggestionRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(hintRoute, (c) => {
      const query = c.req.valid("query");
      return c.json(transferHint(db, { accountId: query.accountId, date: query.date, amount: query.amount }), 200);
    })
    .openapi(suggestRoute, (c) => {
      const query = c.req.valid("query");
      return c.json(suggestForPayee(db, query.accountId, query.payee, query.amount, query.date), 200);
    })
    .openapi(pairRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(acceptTransferPair(db, c.req.valid("query").asOf, body.leftId, body.rightId, { source: "ui" }), 200);
    });
}
