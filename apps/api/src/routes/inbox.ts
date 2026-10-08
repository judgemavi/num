import { asOfQuerySchema, errorSchema, inboxDismissSchema, inboxQuerySchema, inboxRestoreSchema, inboxSchema } from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { dismissInboxItem, listInbox, restoreInboxItem } from "../services/inbox";
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

export function registerInbox(app: OpenAPIHono, db: Db) {
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
