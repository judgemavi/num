import {
  asOfQuerySchema,
  errorSchema,
  inboxDecisionCreateSchema,
  inboxDecisionListSchema,
  inboxDecisionSchema,
  inboxDecisionUndoSchema,
  inboxGroupApplyResultSchema,
  inboxGroupApplySchema,
  inboxQuerySchema,
  inboxSchema,
  inboxUnreadableAcceptSchema,
  payeeCountQuerySchema,
  payeeCountSchema,
} from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { acceptUnreadableLine, decideInboxItem, decisionRows, undoInboxDecision } from "../services/inbox-decisions";
import { listInbox } from "../services/inbox";
import { applyInboxGroup, countOtherUncategorized } from "../services/inbox-group";
import { autoLink } from "../services/recurring-view";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const listRoute = createRoute({
  method: "get",
  path: "/api/inbox",
  request: { query: inboxQuerySchema },
  responses: {
    200: { description: "Inbox items for this date", content: { "application/json": { schema: inboxSchema } } },
    400: errorResponse,
  },
});

const decisionsRoute = createRoute({
  method: "get",
  path: "/api/inbox/decisions",
  responses: {
    200: { description: "Recorded inbox decisions", content: { "application/json": { schema: inboxDecisionListSchema } } },
  },
});

const decideRoute = createRoute({
  method: "post",
  path: "/api/inbox/decisions",
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
  method: "post",
  path: "/api/inbox/decisions/undo",
  request: {
    body: { required: true, content: { "application/json": { schema: inboxDecisionUndoSchema } } },
  },
  responses: {
    200: { description: "The undone decision", content: { "application/json": { schema: inboxDecisionUndoSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const acceptRoute = createRoute({
  method: "post",
  path: "/api/inbox/unreadable",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: inboxUnreadableAcceptSchema } } },
  },
  responses: {
    200: { description: "The unreadable row was added by hand", content: { "application/json": { schema: inboxUnreadableAcceptSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const groupRoute = createRoute({
  method: "post",
  path: "/api/inbox/groups",
  request: { body: { required: true, content: { "application/json": { schema: inboxGroupApplySchema } } } },
  responses: {
    200: { description: "The group was categorized", content: { "application/json": { schema: inboxGroupApplyResultSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const payeeCountRoute = createRoute({
  method: "get",
  path: "/api/inbox/payee-count",
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

export function registerInbox(app: OpenAPIHono, db: Db) {
  app.openapi(groupRoute, (c) => c.json(applyInboxGroup(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(payeeCountRoute, (c) => {
    const query = c.req.valid("query");
    return c.json({ count: countOtherUncategorized(db, query.payee, query.accountId, exceptIds(query.except)) }, 200);
  });
  app.openapi(decisionsRoute, (c) => c.json({ items: decisionRows(db) }, 200));
  app.openapi(decideRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(decideInboxItem(db, c.req.valid("query").asOf, body.itemKey, body.decision, { source: "ui" }), 200);
  });
  app.openapi(undoRoute, (c) => c.json(undoInboxDecision(db, c.req.valid("json").itemKey, { source: "ui" }), 200));
  app.openapi(acceptRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(acceptUnreadableLine(db, c.req.valid("query").asOf, body.itemKey, { source: "ui" }), 200);
  });
  app.openapi(listRoute, (c) => {
    const query = c.req.valid("query");
    try {
      autoLink(db, query.asOf, { source: "ui" });
    } catch (error) {
      console.error("Recurring auto-link failed", error);
    }
    return c.json(listInbox(db, query.asOf), 200);
  });
}
