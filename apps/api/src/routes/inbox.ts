import {
  asOfQuerySchema,
  inboxDecisionCreateSchema,
  inboxDecisionListSchema,
  inboxDecisionSchema,
  inboxDecisionUndoSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { decideInboxItem, decisionRows, undoInboxDecision } from "../services/inbox-decisions";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const decisionsRoute = createRoute({
  operationId: "get_review_decisions",
  description: "Read review decisions. This does not create, change or delete a record.",
  method: "get",
  path: "/api/review/decisions",
  responses: {
    200: { description: "Recorded review decisions", content: { "application/json": { schema: inboxDecisionListSchema } } },
  },
});

const decideRoute = createRoute({
  operationId: "post_review_decisions",
  description: "Record a review decision. A no answer keeps the same question from coming back.",
  method: "post",
  path: "/api/review/decisions",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: inboxDecisionCreateSchema } } },
  },
  responses: {
    200: { description: "The recorded decision", content: { "application/json": { schema: inboxDecisionSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const undoRoute = createRoute({
  operationId: "post_review_decisions_undo",
  description: "Undo a review decision. This reverses that change. It does not remove the audit log.",
  method: "post",
  path: "/api/review/decisions/undo",
  request: {
    body: { required: true, content: { "application/json": { schema: inboxDecisionUndoSchema } } },
  },
  responses: {
    200: { description: "The undone decision", content: { "application/json": { schema: inboxDecisionUndoSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

export function inboxRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(decisionsRoute, (c) => c.json({ items: decisionRows(db) }, 200))
    .openapi(decideRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(decideInboxItem(db, c.req.valid("query").asOf, body.itemKey, body.decision, { source: "ui" }), 200);
    })
    .openapi(undoRoute, (c) => c.json(undoInboxDecision(db, c.req.valid("json").itemKey, { source: "ui" }), 200));
}

export type InboxRoutes = ReturnType<typeof inboxRoutes>;
