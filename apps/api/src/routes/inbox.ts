import {
  asOfQuerySchema,
  errorSchema,
  inboxDecisionCreateSchema,
  inboxDecisionListSchema,
  inboxDecisionSchema,
  inboxDecisionUndoSchema,
  inboxGroupApplyResultSchema,
  inboxGroupApplySchema,
  payeeCountQuerySchema,
  payeeCountSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { decideInboxItem, decisionRows, undoInboxDecision } from "../services/inbox-decisions";
import { applyInboxGroup, countOtherUncategorized } from "../services/inbox-group";
import { validationHook } from "../validation";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

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

const groupRoute = createRoute({
  operationId: "post_transactions_group",
  description: "Apply one category, transfer or merchant to selected transactions.",
  method: "post",
  path: "/api/transactions/group",
  request: { body: { required: true, content: { "application/json": { schema: inboxGroupApplySchema } } } },
  responses: {
    200: { description: "The group was categorized", content: { "application/json": { schema: inboxGroupApplyResultSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const payeeCountRoute = createRoute({
  operationId: "get_transactions_payee_count",
  description: "Count other uncategorized rows for this payee.",
  method: "get",
  path: "/api/transactions/payee-count",
  request: { query: payeeCountQuerySchema },
  responses: {
    200: { description: "Other uncategorized rows for this payee", content: { "application/json": { schema: payeeCountSchema } } },
    400: errorResponse,
  },
});

function exceptIds(except: string | undefined): string[] {
  if (!except) {
    return [];
  }
  return except.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

export function inboxRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(groupRoute, (c) => c.json(applyInboxGroup(db, { ...c.req.valid("json"), source: "ui" }), 200))
    .openapi(payeeCountRoute, (c) => {
      const query = c.req.valid("query");
      return c.json({ count: countOtherUncategorized(db, query.payee, query.accountId, exceptIds(query.except)) }, 200);
    })
    .openapi(decisionsRoute, (c) => c.json({ items: decisionRows(db) }, 200))
    .openapi(decideRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(decideInboxItem(db, c.req.valid("query").asOf, body.itemKey, body.decision, { source: "ui" }), 200);
    })
    .openapi(undoRoute, (c) => c.json(undoInboxDecision(db, c.req.valid("json").itemKey, { source: "ui" }), 200));
}

export type InboxRoutes = ReturnType<typeof inboxRoutes>;
