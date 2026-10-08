import {
  asOfQuerySchema,
  errorSchema,
  inboxDismissSchema,
  inboxGroupApplyResultSchema,
  inboxGroupApplySchema,
  inboxQuerySchema,
  inboxRestoreSchema,
  inboxSchema,
  payeeCountQuerySchema,
  payeeCountSchema,
  payeeRuleResultSchema,
  payeeRuleSchema,
} from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { dismissInboxItem, listInbox, restoreInboxItem } from "../services/inbox";
import { applyInboxGroup, countOtherUncategorized, createPayeeRule } from "../services/inbox-group";
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

const dismissRoute = createRoute({
  method: "post",
  path: "/api/inbox/dismissals",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: inboxDismissSchema } } },
  },
  responses: {
    200: {
      description: "The dismissed item",
      content: { "application/json": { schema: inboxRestoreSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const restoreRoute = createRoute({
  method: "post",
  path: "/api/inbox/dismissals/restore",
  request: {
    body: { required: true, content: { "application/json": { schema: inboxRestoreSchema } } },
  },
  responses: {
    200: {
      description: "The restored item",
      content: { "application/json": { schema: inboxRestoreSchema } },
    },
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

const payeeRuleRoute = createRoute({
  method: "post",
  path: "/api/inbox/payee-rules",
  request: { body: { required: true, content: { "application/json": { schema: payeeRuleSchema } } } },
  responses: {
    200: { description: "The rule and the other payee rows", content: { "application/json": { schema: payeeRuleResultSchema } } },
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
  app.openapi(payeeRuleRoute, (c) => c.json(createPayeeRule(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(payeeCountRoute, (c) => {
    const query = c.req.valid("query");
    return c.json({ count: countOtherUncategorized(db, query.payee, exceptIds(query.except)) }, 200);
  });
  app.openapi(listRoute, (c) => {
    const query = c.req.valid("query");
    try {
      autoLink(db, query.asOf, { source: "ui" });
    } catch (error) {
      console.error("Recurring auto-link failed", error);
    }
    return c.json(listInbox(db, query.asOf, query.dismissed), 200);
  });
  app.openapi(dismissRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(dismissInboxItem(db, c.req.valid("query").asOf, body.itemKey, body.reason, { source: "ui" }), 200);
  });
  app.openapi(restoreRoute, (c) => c.json(restoreInboxItem(db, c.req.valid("json").itemKey, { source: "ui" }), 200));
}
